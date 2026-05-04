import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 10000 } = {}) {
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

test("blocker probe, start, status, and simulate are capability-gated and fail safe", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-blocker-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const fixture = join(dataDir, "auth-exec.json");
  await writeFile(fixture, JSON.stringify({
    eventType: "AUTH_EXEC",
    pid: 4242,
    processName: "codex",
    command: "git push origin main",
    actor: "agent-codex",
    target: "origin main",
  }), "utf8");

  const probe = await runKlemm(["blocker", "probe"], { env });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /Klemm blocker capability/);
  assert.match(probe.stdout, /Endpoint Security: required/);
  assert.match(probe.stdout, /capability=(available|unavailable)/);
  assert.match(probe.stdout, /fallback=supervised\/adapter blocking/);

  const started = await runKlemm(["blocker", "start", "--mission", "mission-blocker", "--policy-pack", "coding-afk"], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm blocker started/);
  assert.match(started.stdout, /mode=capability-gated/);
  assert.match(started.stdout, /AUTH_EXEC/);

  const simulated = await runKlemm(["blocker", "simulate", "--event", fixture], { env });
  assert.equal(simulated.status, 0, simulated.stderr);
  assert.match(simulated.stdout, /Klemm blocker simulation/);
  assert.match(simulated.stdout, /event=AUTH_EXEC/);
  assert.match(simulated.stdout, /agent_like=yes/);
  assert.match(simulated.stdout, /decision=deny/);
  assert.match(simulated.stdout, /reason=.*git push/);

  const status = await runKlemm(["blocker", "status"], { env });
  assert.match(status.stdout, /Klemm blocker status/);
  assert.match(status.stdout, /mission=mission-blocker/);
  assert.match(status.stdout, /last_decision=deny/);

  const stopped = await runKlemm(["blocker", "stop"], { env });
  assert.match(stopped.stdout, /Klemm blocker stopped/);
});
