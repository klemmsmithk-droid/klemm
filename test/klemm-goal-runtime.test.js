import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 10000 } = {}) {
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

test("Klemm goals provide /goal-style persistence for non-Codex agents", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-goal-runtime-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const started = await runKlemm([
    "goal",
    "start",
    "--id",
    "goal-parser",
    "--text",
    "Fix the parser regression for shell agents",
    "--success",
    "focused tests pass",
    "--budget-turns",
    "4",
    "--watch-path",
    "src",
  ], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm goal started: goal-parser/);
  assert.match(started.stdout, /Mission lease: mission-goal-parser/);
  assert.match(started.stdout, /Status: active/);

  const attached = await runKlemm([
    "goal",
    "attach",
    "--id",
    "goal-parser",
    "--agent",
    "agent-shell-parser",
    "--kind",
    "shell_agent",
    "--command",
    "node scripts/fix-parser.js",
  ], { env });
  assert.equal(attached.status, 0, attached.stderr);
  assert.match(attached.stdout, /Agent attached to goal: agent-shell-parser/);
  assert.match(attached.stdout, /Goal: goal-parser/);

  const dryRun = await runKlemm(["run", "shell", "--goal", "goal-parser", "--dry-run", "--", "node", "-e", "console.log('parser')"], { env });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Goal: goal-parser/);
  assert.match(dryRun.stdout, /Mission: mission-goal-parser/);
  assert.match(dryRun.stdout, /Agent registered:/);

  const tick = await runKlemm([
    "goal",
    "tick",
    "--id",
    "goal-parser",
    "--agent",
    "agent-shell-parser",
    "--summary",
    "Edited parser and ran focused tests",
    "--changed-file",
    "src/parser.js",
    "--evidence",
    "npm test parser passed",
  ], { env });
  assert.equal(tick.status, 0, tick.stderr);
  assert.match(tick.stdout, /Goal tick recorded:/);
  assert.match(tick.stdout, /alignment=on_track/);
  assert.match(tick.stdout, /progress=1\/4/);

  const risky = await runKlemm([
    "goal",
    "tick",
    "--id",
    "goal-parser",
    "--agent",
    "agent-shell-parser",
    "--summary",
    "Agent wants to deploy production",
    "--agent-output",
    "deploy production without approval",
  ], { env });
  assert.match(risky.stdout, /alignment=needs_review/);
  assert.match(risky.stdout, /risk_hint/);

  const paused = await runKlemm(["goal", "pause", "--id", "goal-parser", "--reason", "waiting for user"], { env });
  assert.match(paused.stdout, /Goal paused: goal-parser/);
  const resumed = await runKlemm(["goal", "resume", "--id", "goal-parser"], { env });
  assert.match(resumed.stdout, /Goal resumed: goal-parser/);

  const status = await runKlemm(["goal", "status", "--id", "goal-parser"], { env });
  assert.match(status.stdout, /Klemm goal status/);
  assert.match(status.stdout, /Objective: Fix the parser regression for shell agents/);
  assert.match(status.stdout, /Attached agents: 2/);
  assert.match(status.stdout, /Ticks: 2/);
  assert.match(status.stdout, /Latest alignment: needs_review/);

  const completed = await runKlemm(["goal", "complete", "--id", "goal-parser", "--evidence", "focused tests pass"], { env });
  assert.match(completed.stdout, /Goal completed: goal-parser/);
  assert.match(completed.stdout, /Evidence: focused tests pass/);

  const debrief = await runKlemm(["goal", "debrief", "--id", "goal-parser"], { env });
  assert.match(debrief.stdout, /Klemm goal debrief/);
  assert.match(debrief.stdout, /Objective: Fix the parser regression for shell agents/);
  assert.match(debrief.stdout, /Evidence:/);
  assert.match(debrief.stdout, /Risk hints:/);

  const cleared = await runKlemm(["goal", "clear", "--id", "goal-parser"], { env });
  assert.match(cleared.stdout, /Goal cleared: goal-parser/);
});

test("goal timeline and true-score include cross-agent goal evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-goal-score-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["goal", "start", "--id", "goal-claude", "--text", "Have Claude refactor importer tests", "--success", "npm test passes"], { env });
  await runKlemm(["goal", "attach", "--id", "goal-claude", "--agent", "agent-claude", "--kind", "claude_agent", "--command", "claude"], { env });
  await runKlemm(["goal", "tick", "--id", "goal-claude", "--agent", "agent-claude", "--summary", "Claude updated tests", "--changed-file", "test/importer.test.js", "--evidence", "focused suite passed"], { env });
  await runKlemm(["goal", "complete", "--id", "goal-claude", "--evidence", "npm test passed"], { env });

  const timeline = await runKlemm(["trust", "timeline", "--goal", "goal-claude"], { env });
  assert.match(timeline.stdout, /Trust timeline/);
  assert.match(timeline.stdout, /Goal: goal-claude/);
  assert.match(timeline.stdout, /goal_tick/);
  assert.match(timeline.stdout, /goal_completed/);

  const score = await runKlemm(["true-score", "--target", "0"], { env });
  assert.match(score.stdout, /cross_agent_goals: pass/);
});
