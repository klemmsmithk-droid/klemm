import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 30000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
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
  });
}

test("live adapter trial shows honest cross-agent status and next fixes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-live-adapter-trial-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-live-adapter-trial", "--text", "Kyle wants no fake adapter evidence; live means actual observed events."], { env });

  const started = await runKlemm([
    "trial",
    "live-adapters",
    "start",
    "--id",
    "mission-live-adapter-trial",
    "--goal",
    "Make Klemm a cross-agent authority layer",
    "--home",
    home,
    "--",
    "node",
    "-e",
    "console.log('codex live adapter trial')",
  ], { env });

  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Live Adapter Trial started/);
  assert.match(started.stdout, /Truth labels: live means observed adapter evidence, not installed config/);
  assert.match(started.stdout, /codex live adapter trial/);
  assert.match(started.stdout, /Codex: live/);
  assert.match(started.stdout, /Claude: installed not seen/);
  assert.match(started.stdout, /Cursor: installed not seen/);
  assert.match(started.stdout, /Shell: installed not seen/);
  assert.match(started.stdout, /MCP: installed not seen/);
  assert.match(started.stdout, /Browser: installed not seen/);
  assert.match(started.stdout, /Next fix: Run Claude Code with installed Klemm hooks/);

  const status = await runKlemm(["trial", "live-adapters", "status", "--mission", "mission-live-adapter-trial", "--home", home], { env });
  assert.match(status.stdout, /Live Adapter Trial/);
  assert.match(status.stdout, /Live adapters: 1\/6/);
  assert.match(status.stdout, /Codex: live/);
  assert.match(status.stdout, /Claude: installed not seen/);
  assert.match(status.stdout, /Cursor: installed not seen/);
});

test("live adapter trial records public Claude Cursor and shell proof paths without calling them final", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-live-adapter-trial-proof-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-live-adapter-proof", "--text", "Kyle allows local adapter proof commands but not fake final-product claims."], { env });

  const started = await runKlemm([
    "trial",
    "live-adapters",
    "start",
    "--id",
    "mission-live-adapter-proof",
    "--goal",
    "Exercise public adapter proof paths",
    "--home",
    home,
    "--prove",
    "claude,cursor,shell",
    "--",
    "node",
    "-e",
    "console.log('codex trial proof')",
  ], { env });

  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Claude proof path: observed/);
  assert.match(started.stdout, /Cursor proof path: observed/);
  assert.match(started.stdout, /Shell proof path: observed/);
  assert.match(started.stdout, /Live adapters: 4\/6/);
  assert.match(started.stdout, /MCP: installed not seen/);
  assert.match(started.stdout, /Browser: installed not seen/);
  assert.match(started.stdout, /Final-product note: live proof paths improve product evidence but do not equal sustained adoption/);

  const finished = await runKlemm(["trial", "live-adapters", "finish", "--mission", "mission-live-adapter-proof"], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /Live Adapter Trial debrief/);
  assert.match(finished.stdout, /Mission finished: mission-live-adapter-proof/);
});
