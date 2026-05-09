import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
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

test("AFK proxy works for non-Codex agents and pauses on unresolved queue", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-proxy-final-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["memory", "seed-proxy", "--id", "memory-proxy-final", "--text", "Kyle uses proceed to continue safe local implementation when the queue is clean."], { env });

  const started = await runKlemm(["afk", "start", "--id", "mission-proxy-final", "--goal", "Cross-agent proxy", "--agent", "claude", "--", "node", "-e", "console.log('safe claude work')"], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Autopilot decision: continue/);

  await runKlemm(["propose", "--id", "decision-proxy-final-push", "--mission", "mission-proxy-final", "--actor", "agent-claude", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });
  const next = await runKlemm(["afk", "next", "--mission", "mission-proxy-final"], { env });
  assert.equal(next.status, 2);
  assert.match(next.stdout, /Autopilot decision: queue|Autopilot decision: pause/);
  assert.match(next.stdout, /Pause and ask Kyle|Unresolved queue/);

  const evidence = await runKlemm(["ultimate", "evidence", "--mission", "mission-proxy-final"], { env });
  assert.match(evidence.stdout, /proxy_autopilot: live/);
  assert.match(evidence.stdout, /agent-claude/);
});

