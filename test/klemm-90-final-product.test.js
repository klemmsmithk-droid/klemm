import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

test("dogfood 90 and true-score require actual daily-product evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-90-"));
  const home = join(dataDir, "home");
  const serverDir = join(dataDir, "sync-server");
  const processFile = join(dataDir, "ps.txt");
  const eventFile = join(dataDir, "auth-exec.json");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, KLEMM_SYNC_PASSPHRASE: "correct horse battery staple" };
  await mkdir(home, { recursive: true });
  await writeFile(processFile, "101 Codex codex --ask-for-approval on-request\n202 Claude claude code\n303 Cursor cursor-agent run\n", "utf8");
  await writeFile(eventFile, JSON.stringify({ eventType: "AUTH_EXEC", processName: "codex", command: "git push origin main", actor: "agent-codex", target: "origin main" }), "utf8");

  const early = await runKlemm(["true-score", "--target", "90"], { env });
  assert.equal(early.status, 1);
  assert.match(early.stdout, /Target: 90%/);
  assert.match(early.stdout, /afk_live_loop: fail/);
  assert.match(early.stdout, /helper_fresh: fail/);

  const started = await runKlemm(["dogfood", "90", "start", "--id", "mission-klemm-90", "--goal", "Reach 90 percent actual-final Klemm"], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm 90 dogfood started/);

  const blockedFinish = await runKlemm(["dogfood", "90", "finish", "--mission", "mission-klemm-90"], { env });
  assert.equal(blockedFinish.status, 2);
  assert.match(blockedFinish.stdout, /Klemm 90 dogfood finish blocked/);
  assert.match(blockedFinish.stdout, /helper_fresh=missing/);
  assert.match(blockedFinish.stdout, /trust_v5=missing/);

  await runKlemm(["memory", "seed-proxy", "--id", "memory-90-proceed", "--text", "Kyle uses proceed and what's next to mean continue safe local implementation with tests and debrief."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-90-no-corners", "--text", "Kyle's no corners cut rule means full supervised verification and real debrief evidence."], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--source-ref", "score-90", "--text", "Klemm should queue git pushes and production deploys while Kyle is AFK. Kyle prefers terminal-native dogfood with exact evidence."], { env });
  await runKlemm(["memory", "scale", "review", "--source-preview", "--limit", "10"], { env });
  await runKlemm(["memory", "scale", "approve", "--cluster", "authority_boundaries", "--limit", "1", "--promote-policy"], { env });
  await runKlemm(["memory", "scale", "approve", "--cluster", "prompt_intent_patterns", "--limit", "2"], { env });
  await runKlemm(["helper", "follow", "--mission", "mission-klemm-90", "--process-file", processFile, "--frontmost-app", "Codex", "--watch-path", "src"], { env });
  await runKlemm(["afk", "start", "--id", "mission-klemm-90", "--goal", "Reach 90 percent actual-final Klemm", "--agent", "codex", "--", "node", "-e", "console.log('90 proof')"], { env });
  await runKlemm(["afk", "next", "--mission", "mission-klemm-90"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-klemm-90", "--type", "diff", "--summary", "90 percent implementation diff captured", "--file", "src/klemm-cli.js"], { env });
  await runKlemm(["propose", "--id", "decision-90-push", "--mission", "mission-klemm-90", "--actor", "agent-codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });
  await runKlemm(["trust", "why", "--v5", "decision-90-push"], { env });
  await runKlemm(["queue", "deny", "decision-90-push", "No push during 90 dogfood proof."], { env });
  await runKlemm(["trust", "why", "--autopilot", "autopilot-tick-mission-klemm-90-1", "--v5"], { env });
  await runKlemm(["adapters", "dogfood", "--suite", "95", "--fake-home", home, "--mission", "mission-klemm-90", "--goal", "goal-klemm-90"], { env });
  await runKlemm(["blocker", "start", "--mission", "mission-klemm-90", "--policy-pack", "coding-afk"], { env });
  await runKlemm(["blocker", "simulate", "--event", eventFile], { env });
  await runKlemm(["sync", "hosted", "init", "--url", `file://${serverDir}`, "--token", "test-token"], { env });
  await runKlemm(["sync", "hosted", "push", "--encrypted"], { env });
  await runKlemm(["supervise", "--mission", "mission-klemm-90", "--watch", "--capture", "--record-tree", "--", "node", "-e", "console.log('full test proof')"], { env });

  const checkpoint = await runKlemm(["dogfood", "90", "checkpoint", "--mission", "mission-klemm-90"], { env });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.match(checkpoint.stdout, /Klemm 90 dogfood checkpoint/);
  assert.match(checkpoint.stdout, /afk_live_loop=present/);
  assert.match(checkpoint.stdout, /helper_fresh=present/);
  assert.match(checkpoint.stdout, /trust_v5=present/);
  assert.match(checkpoint.stdout, /Rails: pass/);

  const finish = await runKlemm(["dogfood", "90", "finish", "--mission", "mission-klemm-90"], { env });
  assert.equal(finish.status, 0, finish.stderr);
  assert.match(finish.stdout, /Klemm 90 dogfood finished/);
  assert.match(finish.stdout, /actual_product_rails=pass/);

  const score = await runKlemm(["true-score", "--target", "90"], { env });
  assert.equal(score.status, 0, score.stderr);
  assert.match(score.stdout, /Target: 90%/);
  assert.match(score.stdout, /Score: 90%|Score: 100%/);
  for (const gate of ["afk_live_loop", "helper_fresh", "codex_contract", "adapter_proof", "kyle_memory_scale", "trust_v5", "hosted_sync", "capability_blocker", "supervised_verification"]) {
    assert.match(score.stdout, new RegExp(`${gate}: pass`));
  }
});
