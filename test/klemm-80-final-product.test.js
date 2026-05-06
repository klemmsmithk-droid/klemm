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

test("dogfood 80 and true-score require the AFK user-stand-in loop", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-80-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir };

  const early = await runKlemm(["true-score", "--target", "80"], { env });
  assert.equal(early.status, 1);
  assert.match(early.stdout, /afk_autopilot: fail/);

  const started = await runKlemm(["dogfood", "80", "start", "--id", "mission-klemm-80", "--goal", "Build AFK autopilot for Klemm"], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm 80 dogfood started/);

  await runKlemm(["memory", "seed-proxy", "--id", "memory-80-proceed", "--text", "Kyle uses proceed and what's next to mean continue safe local implementation."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-80-no-corners", "--text", "No corners cut means focused tests, full tests, debrief, and no fake evidence."], { env });
  await runKlemm(["afk", "start", "--id", "mission-klemm-80", "--goal", "Build AFK autopilot for Klemm", "--agent", "codex", "--", "node", "-e", "console.log('80 proof')"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-klemm-80", "--type", "diff", "--summary", "AFK autopilot diff captured", "--file", "src/klemm-cli.js"], { env });
  await runKlemm(["propose", "--id", "decision-80-push", "--mission", "mission-klemm-80", "--actor", "agent-codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });
  await runKlemm(["queue", "deny", "decision-80-push", "No push during 80 dogfood proof."], { env });
  await runKlemm(["dogfood", "adapters", "--id", "goal-80-adapters", "--goal", "Prove adapter compliance for 80", "--home", home], { env });
  await runKlemm(["trust", "why", "--autopilot", "autopilot-tick-mission-klemm-80-1"], { env });

  const checkpoint = await runKlemm(["dogfood", "80", "checkpoint", "--mission", "mission-klemm-80"], { env });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.match(checkpoint.stdout, /Klemm 80 dogfood checkpoint/);
  assert.match(checkpoint.stdout, /afk_autopilot=present/);
  assert.match(checkpoint.stdout, /adapter_compliance=present/);

  const finish = await runKlemm(["dogfood", "80", "finish", "--mission", "mission-klemm-80"], { env });
  assert.equal(finish.status, 0, finish.stderr);
  assert.match(finish.stdout, /Klemm 80 dogfood finished/);
  assert.match(finish.stdout, /Final product 80 rails: pass/);

  const score = await runKlemm(["true-score", "--target", "80"], { env });
  assert.equal(score.status, 0, score.stderr);
  assert.match(score.stdout, /Target: 80%/);
  assert.match(score.stdout, /afk_autopilot: pass/);
  assert.match(score.stdout, /codex_afk_loop: pass/);
  assert.match(score.stdout, /adapter_compliance_80: pass/);
  assert.match(score.stdout, /Score: 80%|Score: 100%/);
});
