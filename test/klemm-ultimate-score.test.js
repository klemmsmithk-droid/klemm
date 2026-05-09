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

test("ultimate score is permanent, live-only, and ignores fake-home proof rails", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-ultimate-score-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });

  const early = await runKlemm(["ultimate", "score"], { env });
  assert.equal(early.status, 1);
  assert.match(early.stdout, /Klemm ultimate score/);
  assert.match(early.stdout, /Permanent scorecard: yes/);
  assert.match(early.stdout, /Only live\/trusted evidence counts/);
  assert.match(early.stdout, /Real live adapters: missing .*0\/15/);

  await runKlemm(["adapters", "dogfood", "--suite", "95", "--fake-home", home, "--mission", "mission-ultimate-score", "--goal", "goal-ultimate-score"], { env });
  const afterFixture = await runKlemm(["ultimate", "score"], { env });
  assert.equal(afterFixture.status, 1);
  assert.match(afterFixture.stdout, /adapter_battle_fixture: fixture ignored/);
  assert.match(afterFixture.stdout, /Real live adapters: fixture .*0\/15/);

  const legacy = await runKlemm(["true-score", "--target", "90"], { env });
  assert.match(legacy.stdout, /Prototype score: non-final/);
  assert.match(legacy.stdout, /Use `klemm ultimate score` for true final-product completion/);
});

test("ultimate score refuses to treat one scripted dogfood ceremony as product maturity", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-ultimate-anti-vanity-"));
  const home = join(dataDir, "home");
  const processFile = join(dataDir, "ps.txt");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, KLEMM_SYNC_PASSPHRASE: "anti vanity passphrase" };
  await mkdir(home, { recursive: true });
  await writeFile(processFile, "101 Codex codex\n", "utf8");

  await runKlemm(["dogfood", "ultimate", "start", "--id", "mission-anti-vanity", "--goal", "Do not fake 95"], { env });
  await runKlemm(["daemon", "ensure", "--data-dir", dataDir, "--dry-run"], { env });
  await runKlemm(["helper", "follow", "--mission", "mission-anti-vanity", "--process-file", processFile, "--frontmost-app", "Codex", "--watch-path", "src"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-anti-vanity", "--text", "Kyle wants safe local Klemm work with no fake evidence."], { env });
  await runKlemm(["afk", "start", "--id", "mission-anti-vanity", "--goal", "Do not fake 95", "--agent", "codex", "--", "node", "-e", "console.log('proof')"], { env });
  for (const type of ["session_start", "plan", "tool_call", "diff", "debrief", "session_finish"]) {
    await runKlemm(["codex", "report", "--mission", "mission-anti-vanity", "--type", type, "--summary", `Codex ${type}`, "--file", "src/klemm-cli.js"], { env });
  }
  await runKlemm(["adapters", "prove", "--live", "codex", "--mission", "mission-anti-vanity"], { env });
  await runKlemm(["supervise", "--mission", "mission-anti-vanity", "--watch", "--capture", "--record-tree", "--", "node", "-e", "console.log(['git','push','origin','main'].join(' '))"], { env });
  await runKlemm(["trust", "why", "--autopilot", "autopilot-tick-mission-anti-vanity-1", "--v6"], { env });
  await runKlemm(["security", "adversarial-test", "--suite", "ultimate"], { env });
  await runKlemm(["sync", "hosted", "init", "--url", `file://${join(dataDir, "sync-server")}`, "--token", "token"], { env });
  await runKlemm(["sync", "hosted", "push", "--encrypted"], { env });

  const score = await runKlemm(["ultimate", "score"], { env });
  assert.equal(score.status, 1);
  assert.doesNotMatch(score.stdout, /Score: (8[0-9]|9[0-9]|100)%/);
  assert.match(score.stdout, /single-session evidence/i);
  assert.match(score.stdout, /Real live adapters: live .*3\/15/);
});
