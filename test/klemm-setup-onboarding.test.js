import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 3000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: 124, stdout, stderr: `${stderr}\nTimed out: ${args.join(" ")}` });
    }, timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

test("setup installs daemon artifacts, Codex integration, default sync sources, and health plan", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-setup-"));
  const codexDir = join(dataDir, "codex-install");
  const codexHistory = join(dataDir, "codex.jsonl");
  await writeFile(codexHistory, JSON.stringify({ session_id: "setup", role: "user", message: "I prefer setup-driven Klemm installs." }), "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };

  const setup = await runKlemm([
    "setup",
    "--data-dir",
    dataDir,
    "--codex-dir",
    codexDir,
    "--codex-history",
    codexHistory,
    "--never",
    "Never let agents deploy production without approval.",
    "--dry-run-launchctl",
  ], { env });

  assert.equal(setup.status, 0, setup.stderr);
  assert.match(setup.stdout, /Klemm setup complete/);
  assert.match(setup.stdout, /Daemon plist:/);
  assert.match(setup.stdout, /Codex integration:/);
  assert.match(setup.stdout, /Sync source added: codex-history/);
  assert.match(setup.stdout, /Health check:/);
  assert.match(await readFile(join(dataDir, "com.klemm.daemon.plist"), "utf8"), /launchd/);
  assert.match(await readFile(join(codexDir, "mcp.json"), "utf8"), /klemm-mcp-server/);

  const model = await runKlemm(["user", "model"], { env });
  assert.equal(model.status, 0, model.stderr);
  assert.match(model.stdout, /deploy production/);

  const sync = await runKlemm(["sync", "status"], { env });
  assert.match(sync.stdout, /codex-history codex/);
});

test("launchctl lifecycle commands render bootstrap, bootout, and kickstart safely in dry-run mode", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-launchctl-"));
  const plistPath = join(dataDir, "com.klemm.daemon.plist");
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["daemon", "install", "--output", plistPath, "--data-dir", dataDir], { env });

  const bootstrap = await runKlemm(["daemon", "bootstrap", "--plist", plistPath, "--dry-run"], { env });
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.match(bootstrap.stdout, /launchctl bootstrap/);
  assert.match(bootstrap.stdout, /gui\/\d+/);

  const kickstart = await runKlemm(["daemon", "kickstart", "--label", "com.klemm.daemon", "--dry-run"], { env });
  assert.equal(kickstart.status, 0, kickstart.stderr);
  assert.match(kickstart.stdout, /launchctl kickstart/);

  const bootout = await runKlemm(["daemon", "bootout", "--plist", plistPath, "--dry-run"], { env });
  assert.equal(bootout.status, 0, bootout.stderr);
  assert.match(bootout.stdout, /launchctl bootout/);
});

test("onboarding wizard persists authority boundaries, watch paths, sync sources, and reviewed preferences", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-onboard-"));
  const codexHistory = join(dataDir, "codex.jsonl");
  await writeFile(codexHistory, JSON.stringify({ session_id: "onboard", role: "user", message: "I prefer terminal-first onboarding." }), "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };

  const onboard = await runKlemm(["onboard", "--stdin"], {
    env,
    input: [
      "Never let agents push to GitHub without approval.",
      "/Users/example/klemm",
      codexHistory,
      "I prefer terminal-first tools.",
      "yes",
      "",
    ].join("\n"),
  });

  assert.equal(onboard.status, 0, onboard.stderr);
  assert.match(onboard.stdout, /Onboarding complete/);
  assert.match(onboard.stdout, /Policy promoted:/);
  assert.match(onboard.stdout, /Sync source added: codex-history/);
  assert.match(onboard.stdout, /Watch path added:/);

  const model = await runKlemm(["user", "model"], { env });
  assert.match(model.stdout, /terminal-first/);
  assert.match(model.stdout, /GitHub/);

  const sync = await runKlemm(["sync", "status"], { env });
  assert.match(sync.stdout, /codex-history codex/);
});
