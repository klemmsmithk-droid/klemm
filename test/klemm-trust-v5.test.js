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

test("trust v5 explains queued decisions and autopilot continuations with exact Kyle evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-trust-v5-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["context", "import", "--provider", "chatgpt", "--source-ref", "trust-v5", "--text", "Kyle wants Klemm to queue git pushes, deploys, and external actions while AFK. Kyle uses proceed to continue safe local implementation with tests and debrief."], { env });
  await runKlemm(["memory", "scale", "approve", "--cluster", "authority_boundaries", "--limit", "1", "--promote-policy"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-trust-v5-proceed", "--text", "Kyle uses proceed to authorize safe local implementation when the queue is clean."], { env });
  await runKlemm(["mission", "start", "--id", "mission-trust-v5", "--hub", "codex", "--goal", "Explain trust v5"], { env });
  await runKlemm(["propose", "--id", "decision-trust-v5-push", "--mission", "mission-trust-v5", "--actor", "agent-codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });

  const decisionWhy = await runKlemm(["trust", "why", "--v5", "decision-trust-v5-push"], { env });
  assert.equal(decisionWhy.status, 0, decisionWhy.stderr);
  assert.match(decisionWhy.stdout, /Trust UX v5/);
  assert.match(decisionWhy.stdout, /Bottom line: Queue this action/);
  assert.match(decisionWhy.stdout, /Exact evidence chain/);
  assert.match(decisionWhy.stdout, /Kyle memory used/);
  assert.match(decisionWhy.stdout, /Uncertainty:/);
  assert.match(decisionWhy.stdout, /What would change the decision/);
  assert.match(decisionWhy.stdout, /Correction command: klemm corrections add --decision decision-trust-v5-push/);

  await runKlemm(["queue", "deny", "decision-trust-v5-push", "Keep autopilot queue clean for trust v5 continuation."], { env });
  await runKlemm(["afk", "start", "--id", "mission-trust-v5", "--goal", "Explain trust v5", "--agent", "codex", "--", "node", "-e", "console.log('trust v5')"], { env });
  const autopilotWhy = await runKlemm(["trust", "why", "--autopilot", "autopilot-tick-mission-trust-v5-1", "--v5"], { env });
  assert.equal(autopilotWhy.status, 0, autopilotWhy.stderr);
  assert.match(autopilotWhy.stdout, /Trust UX v5/);
  assert.match(autopilotWhy.stdout, /Bottom line: Continue safely/);
  assert.match(autopilotWhy.stdout, /Exact next prompt:/);
  assert.match(autopilotWhy.stdout, /Kyle memory used/);
  assert.match(autopilotWhy.stdout, /Helper evidence:/);
  assert.match(autopilotWhy.stdout, /Adapter evidence:/);
  assert.match(autopilotWhy.stdout, /Correction command: klemm corrections add --autopilot autopilot-tick-mission-trust-v5-1/);
});
