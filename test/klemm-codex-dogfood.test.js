import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("codex dogfood starts a hub mission and records the opening plan envelope", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const result = await runKlemm([
    "codex",
    "dogfood",
    "--id",
    "mission-codex-dogfood",
    "--goal",
    "Harden the Klemm Codex adapter",
    "--plan",
    "Start mission, report activity, run watched tests, debrief.",
  ], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Codex dogfood session ready: mission-codex-dogfood/);
  assert.match(result.stdout, /Adapter activity: activity-/);
  assert.match(result.stdout, /Next command: klemm supervise --watch-loop/);

  const monitor = await runKlemm(["monitor", "status", "--mission", "mission-codex-dogfood"], { env });
  assert.match(monitor.stdout, /Activities: 1/);
});

test("codex report records adapter tool calls and classifies risky actions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["codex", "hub", "--id", "mission-codex-report", "--goal", "Report adapter activity"], { env });

  const result = await runKlemm([
    "codex",
    "report",
    "--mission",
    "mission-codex-report",
    "--type",
    "tool_call",
    "--summary",
    "Codex plans to push code",
    "--tool",
    "shell",
    "--command",
    "git push origin main",
  ], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Codex adapter envelope recorded/);
  assert.match(result.stdout, /Activity: activity-/);
  assert.match(result.stdout, /Decision: queue/);
});

test("codex run executes through supervised watch-loop and records monitor activity", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["codex", "hub", "--id", "mission-codex-run", "--goal", "Run watched command"], { env });

  const result = await runKlemm([
    "codex",
    "run",
    "--mission",
    "mission-codex-run",
    "--watch-interval-ms",
    "25",
    "--",
    "node",
    "-e",
    "setTimeout(()=>console.log('codex-run-ok'), 80)",
  ], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codex-run-ok/);
  assert.match(result.stdout, /Klemm heartbeat:/);
  assert.match(result.stdout, /Klemm alignment: on_track/);
});
