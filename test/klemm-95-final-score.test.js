import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

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

test("true final product score reaches 95 only after final-vision rails are proven", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-score-95-"));
  const home = join(dataDir, "home");
  const serverDir = join(dataDir, "sync-server");
  const processFile = join(dataDir, "ps.txt");
  const eventFile = join(dataDir, "auth-exec.json");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, KLEMM_SYNC_PASSPHRASE: "correct horse battery staple" };
  await mkdir(home, { recursive: true });
  await writeFile(processFile, "101 Codex codex --ask-for-approval on-request\n202 Claude claude code\n", "utf8");
  await writeFile(eventFile, JSON.stringify({ eventType: "AUTH_EXEC", processName: "codex", command: "git push origin main", actor: "agent-codex", target: "origin main" }), "utf8");

  const early = await runKlemm(["true-score", "--target", "95"], { env });
  assert.equal(early.status, 1);
  assert.match(early.stdout, /Score: \d+%/);
  assert.match(early.stdout, /hosted_sync: fail/);
  assert.match(early.stdout, /capability_blocker: fail/);

  await runKlemm(["dogfood", "95", "start", "--id", "mission-klemm-95", "--goal", "Reach 95 percent final-vision Klemm"], { env });
  await runKlemm(["helper", "follow", "--mission", "mission-klemm-95", "--process-file", processFile, "--frontmost-app", "Codex"], { env });
  await runKlemm(["adapters", "dogfood", "--suite", "95", "--fake-home", home, "--mission", "mission-klemm-95", "--goal", "goal-klemm-95"], { env });
  await runKlemm(["blocker", "start", "--mission", "mission-klemm-95", "--policy-pack", "coding-afk"], { env });
  await runKlemm(["blocker", "simulate", "--event", eventFile], { env });
  await runKlemm(["sync", "hosted", "init", "--url", `file://${serverDir}`, "--token", "test-token"], { env });
  await runKlemm(["sync", "hosted", "push", "--encrypted"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--source-ref", "score-95", "--text", "Klemm should queue production deploys and provide exact evidence. Kyle prefers terminal-native dogfood."], { env });
  await runKlemm(["memory", "scale", "approve", "--cluster", "authority_boundaries", "--limit", "1", "--promote-policy"], { env });
  await runKlemm(["propose", "--mission", "mission-klemm-95", "--actor", "agent-codex", "--type", "deployment", "--target", "deploy production"], { env });
  await runKlemm(["security", "adversarial-test", "--suite", "95"], { env });
  await runKlemm(["dogfood", "95", "checkpoint", "--mission", "mission-klemm-95"], { env });

  const doctor = await runKlemm(["doctor", "--strict", "--skip-health"], { env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Blocker capability:/);
  assert.match(doctor.stdout, /Hosted sync encryption:/);
  assert.match(doctor.stdout, /Adapter battle:/);

  const packaging = await runKlemm(["packaging", "readiness"], { env });
  assert.equal(packaging.status, 0, packaging.stderr);
  assert.match(packaging.stdout, /Klemm packaging readiness/);
  assert.match(packaging.stdout, /Signing:/);
  assert.match(packaging.stdout, /Notarization:/);
  assert.match(packaging.stdout, /LaunchAgent:/);
  assert.match(packaging.stdout, /Helper version:/);
  assert.match(packaging.stdout, /Blocker version:/);
  assert.match(packaging.stdout, /Upgrade path:/);
  assert.match(packaging.stdout, /Uninstall path:/);

  const finish = await runKlemm(["dogfood", "95", "finish", "--mission", "mission-klemm-95", "--force"], { env });
  assert.equal(finish.status, 0, finish.stderr);
  assert.match(finish.stdout, /Klemm 95 dogfood finished/);
  assert.match(finish.stdout, /final_vision_rails=pass/);

  const score = await runKlemm(["true-score", "--target", "95"], { env });
  assert.equal(score.status, 0, score.stderr);
  assert.match(score.stdout, /Klemm true final product score/);
  assert.match(score.stdout, /Score: 95%/);
  for (const gate of ["native_background", "adapter_battle", "memory_scale", "hosted_sync", "capability_blocker", "trust_v4", "security_95", "dogfood_95"]) {
    assert.match(score.stdout, new RegExp(`${gate}: pass`));
  }
});
