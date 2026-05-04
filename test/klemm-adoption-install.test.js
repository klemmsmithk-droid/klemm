import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createInitialKlemmState } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 5000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: 124, stdout, stderr: `${stderr}\nTimed out: ${args.join(" ")}` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function runExecutable(command, args, { env = {}, input = "", timeoutMs = 5000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: 124, stdout, stderr: `${stderr}\nTimed out: ${command} ${args.join(" ")}` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

test("klemm install writes artifacts and prints a clean first-run summary", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-install-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const installed = await runKlemm([
    "install",
    "--data-dir",
    dataDir,
    "--policy-pack",
    "coding-afk",
    "--agents",
    "codex,claude,shell",
  ], { env });

  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Klemm is installed/);
  assert.match(installed.stdout, /Installed:/);
  assert.match(installed.stdout, /Daemon LaunchAgent:/);
  assert.match(installed.stdout, /Codex wrapper:/);
  assert.match(installed.stdout, /Runtime profiles:/);
  assert.match(installed.stdout, /Policy pack: coding-afk/);
  assert.match(installed.stdout, /Next:/);
  assert.match(installed.stdout, /klemm status/);
  assert.doesNotMatch(installed.stdout, /Daemon store migrated/);
  assert.doesNotMatch(installed.stdout, /Klemm doctor/);

  assert.match(await readFile(join(dataDir, "com.klemm.daemon.plist"), "utf8"), /com\.klemm\.daemon/);
  assert.match(await readFile(join(dataDir, "codex-integration", "skills", "klemm", "SKILL.md"), "utf8"), /klemm codex wrap/);
  assert.match(await readFile(join(dataDir, "codex-integration", "mcp.json"), "utf8"), /klemm-mcp-server/);
  assert.match(await readFile(join(dataDir, "codex-integration", "bin", "klemm-codex"), "utf8"), /codex wrap/);
  const profiles = JSON.parse(await readFile(join(dataDir, "profiles", "default-profiles.json"), "utf8"));
  assert.ok(profiles.profiles.codex);
  assert.ok(profiles.profiles.claude);
  assert.ok(profiles.profiles.shell);

  const simulated = await runKlemm(["policy", "simulate", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });
  assert.match(simulated.stdout, /coding-afk/);
});

test("direct klemm executable suppresses Node sqlite warning", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-direct-bin-"));
  const direct = await runExecutable(CLI_PATH, ["version"], { env: { KLEMM_DATA_DIR: dataDir } });
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /Klemm version:/);
  assert.doesNotMatch(direct.stderr, /ExperimentalWarning/);
});

test("onboarding v2 records mode, sources, watch paths, agent wrappers, and approved candidates", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-onboard-v2-"));
  const chatPath = join(dataDir, "chatgpt.json");
  await writeFile(chatPath, JSON.stringify([{ role: "user", content: "Never deploy production without approval. I prefer Codex wrapped by Klemm." }]), "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };

  const onboard = await runKlemm(["onboard", "v2", "--stdin"], {
    env,
    input: [
      "coding-afk",
      chatPath,
      "/Users/kyleklemm-smith/klemm",
      "codex,claude,shell",
      "yes",
      "",
    ].join("\n"),
  });

  assert.equal(onboard.status, 0, onboard.stderr);
  assert.match(onboard.stdout, /Klemm onboarding v2 complete/);
  assert.match(onboard.stdout, /Default mode: coding-afk/);
  assert.match(onboard.stdout, /Sync source added: chatgpt-history/);
  assert.match(onboard.stdout, /Watch path added:/);
  assert.match(onboard.stdout, /Agent wrappers: codex,claude,shell/);
  assert.match(onboard.stdout, /Policy pack applied: coding-afk/);
  assert.match(onboard.stdout, /Approved first memory candidates:/);

  const review = await runKlemm(["memory", "review"], { env });
  assert.doesNotMatch(review.stdout, /pending_review/);
  const model = await runKlemm(["user", "model"], { env });
  assert.match(model.stdout, /deploy production/);
});

test("status and doctor report daemon HTTP health while preserving local fallback", async () => {
  let state = createInitialKlemmState();
  const server = createServer((request, response) => {
    createKlemmHttpServer({
      getState: () => state,
      saveState: (next) => {
        state = next;
      },
    }).emit("request", request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-aware-"));
  const env = { KLEMM_DATA_DIR: dataDir, KLEMM_DAEMON_URL: url };

  try {
    const status = await runKlemm(["status"], { env });
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, new RegExp(`Data dir: ${dataDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(status.stdout, /Daemon transport: ok/);
    assert.match(status.stdout, /Store fallback: available/);

    const doctor = await runKlemm(["doctor", "--url", url], { env });
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /Health: ok/);
    assert.match(doctor.stdout, /Daemon transport: ok/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const fallback = await runKlemm(["status"], {
    env: { KLEMM_DATA_DIR: dataDir, KLEMM_DAEMON_URL: "http://127.0.0.1:1" },
  });
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.match(fallback.stdout, /Daemon transport: unavailable/);
  assert.match(fallback.stdout, /Store fallback: active/);
});

test("packaging commands export/import config, render completions/templates, version, and uninstall", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-packaging-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await mkdir(join(dataDir, "profiles"), { recursive: true });
  await writeFile(join(dataDir, "profiles", "default-profiles.json"), JSON.stringify({ profiles: { codex: { command: ["codex"] } } }), "utf8");
  await runKlemm(["policy", "pack", "apply", "strict-no-external"], { env });

  const version = await runKlemm(["version"], { env });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /Klemm version:/);

  const completions = await runKlemm(["completion", "zsh"], { env });
  assert.equal(completions.status, 0, completions.stderr);
  assert.match(completions.stdout, /_klemm/);
  assert.match(completions.stdout, /codex wrap/);

  const template = await runKlemm(["profiles", "template", "--agent", "codex"], { env });
  assert.equal(template.status, 0, template.stderr);
  assert.match(template.stdout, /"profiles"/);
  assert.match(template.stdout, /"codex"/);

  const exportPath = join(dataDir, "klemm-export.json");
  const exported = await runKlemm(["config", "export", "--output", exportPath], { env });
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(exported.stdout, /Config exported:/);
  assert.match(await readFile(exportPath, "utf8"), /strict-no-external/);

  const importedDir = await mkdtemp(join(tmpdir(), "klemm-imported-config-"));
  const imported = await runKlemm(["config", "import", "--input", exportPath], { env: { KLEMM_DATA_DIR: importedDir } });
  assert.equal(imported.status, 0, imported.stderr);
  assert.match(imported.stdout, /Config imported:/);
  const policies = await runKlemm(["policy", "simulate", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env: { KLEMM_DATA_DIR: importedDir } });
  assert.match(policies.stdout, /strict-no-external/);

  const uninstall = await runKlemm(["uninstall", "--data-dir", importedDir, "--dry-run"], { env: { KLEMM_DATA_DIR: importedDir } });
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.match(uninstall.stdout, /Klemm uninstall dry run/);
  assert.match(uninstall.stdout, /Would remove:/);
});
