import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 20000 } = {}) {
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

async function seedKyleContinuationMemory(env) {
  await runKlemm(["memory", "seed-proxy", "--id", "memory-afk-proceed", "--text", "Kyle uses proceed and what's next to mean continue the next safe local implementation step."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-afk-no-corners", "--text", "No corners cut means focused tests, full tests, and a debrief before calling work done."], { env });
}

test("afk start runs a safe local session and records continuation evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-afk-safe-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await seedKyleContinuationMemory(env);

  const started = await runKlemm([
    "afk",
    "start",
    "--id",
    "mission-afk-safe",
    "--goal",
    "Build a safe local Klemm slice",
    "--agent",
    "codex",
    "--",
    "node",
    "-e",
    "console.log('safe local done')",
  ], { env });

  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm AFK autopilot started: mission-afk-safe/);
  assert.match(started.stdout, /Brief check: aligned/);
  assert.match(started.stdout, /Proxy continuation: high/);
  assert.match(started.stdout, /Autopilot decision: continue/);
  assert.match(started.stdout, /Next prompt: Proceed toward/);
  assert.match(started.stdout, /Klemm supervised exit: 0/);
  assert.match(started.stdout, /Debrief reported: accepted/);

  const status = await runKlemm(["afk", "status", "--mission", "mission-afk-safe"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Klemm AFK autopilot/);
  assert.match(status.stdout, /Status: running/);
  assert.match(status.stdout, /Last decision: continue/);
  assert.match(status.stdout, /Last prompt: Proceed toward/);
  assert.match(status.stdout, /Brief: aligned/);
  assert.match(status.stdout, /Proxy: high continue=yes/);

  const finished = await runKlemm(["afk", "finish", "--mission", "mission-afk-safe"], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /AFK autopilot finished: mission-afk-safe/);
  assert.match(finished.stdout, /Unresolved queue: 0/);
});

test("afk start queues high-risk launches before execution", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-afk-risk-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await seedKyleContinuationMemory(env);

  const started = await runKlemm([
    "afk",
    "start",
    "--id",
    "mission-afk-risk",
    "--goal",
    "Build locally while blocking external actions",
    "--agent",
    "codex",
    "--plan",
    "Run safe local work only.",
    "--",
    "git",
    "push",
    "origin",
    "main",
  ], { env });

  assert.equal(started.status, 2);
  assert.match(started.stdout, /Klemm AFK autopilot started: mission-afk-risk/);
  assert.match(started.stdout, /Autopilot decision: queue/);
  assert.match(started.stdout, /Autopilot stop: queue/);
  assert.match(started.stdout, /Queued decision:/);
  assert.doesNotMatch(started.stdout, /Klemm supervised exit:/);

  const queue = await runKlemm(["queue"], { env });
  assert.match(queue.stdout, /git_push/);
  assert.match(queue.stdout, /origin main/);
});
