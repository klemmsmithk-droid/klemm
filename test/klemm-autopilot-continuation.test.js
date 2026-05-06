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
  await runKlemm(["memory", "seed-proxy", "--id", "memory-cont-proceed", "--text", "Kyle uses proceed to authorize safe local implementation when the queue is clean."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-cont-tests", "--text", "Kyle expects no corners cut: focused tests, full tests, and debrief."], { env });
}

test("afk checkpoint nudges after a failed command and pauses after repeated failures", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-afk-nudge-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await seedKyleContinuationMemory(env);

  const first = await runKlemm([
    "afk",
    "start",
    "--id",
    "mission-afk-nudge",
    "--goal",
    "Recover from failing local tests",
    "--agent",
    "shell",
    "--",
    "node",
    "-e",
    "process.exit(1)",
  ], { env });
  assert.equal(first.status, 1);
  assert.match(first.stdout, /Autopilot decision: nudge/);
  assert.match(first.stdout, /switch strategy|course correction/i);

  await runKlemm(["supervise", "--capture", "--mission", "mission-afk-nudge", "--", "node", "-e", "process.exit(1)"], { env });
  await runKlemm(["supervise", "--capture", "--mission", "mission-afk-nudge", "--", "node", "-e", "process.exit(1)"], { env });

  const checkpoint = await runKlemm(["afk", "checkpoint", "--mission", "mission-afk-nudge"], { env });
  assert.equal(checkpoint.status, 2);
  assert.match(checkpoint.stdout, /Klemm AFK checkpoint/);
  assert.match(checkpoint.stdout, /Autopilot decision: pause/);
  assert.match(checkpoint.stdout, /repeated failures|stuck/i);
  assert.match(checkpoint.stdout, /Pause and ask Kyle/);
});

test("afk checkpoint refuses to continue while queue is unresolved", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-afk-queue-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await seedKyleContinuationMemory(env);
  await runKlemm(["afk", "start", "--id", "mission-afk-queue", "--goal", "Keep queue clean", "--agent", "codex", "--dry-run"], { env });
  await runKlemm(["propose", "--id", "decision-afk-push", "--mission", "mission-afk-queue", "--actor", "agent-codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });

  const checkpoint = await runKlemm(["afk", "checkpoint", "--mission", "mission-afk-queue"], { env });
  assert.equal(checkpoint.status, 2);
  assert.match(checkpoint.stdout, /Autopilot decision: queue/);
  assert.match(checkpoint.stdout, /queued decision/);
  assert.match(checkpoint.stdout, /Pause and ask Kyle/);
});
