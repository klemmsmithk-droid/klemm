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

test("dogfood ultimate refuses fake proof and finishes only with live evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-dogfood-ultimate-"));
  const home = join(dataDir, "home");
  const processFile = join(dataDir, "ps.txt");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, KLEMM_SYNC_PASSPHRASE: "ultimate dogfood passphrase" };
  await mkdir(home, { recursive: true });
  await writeFile(processFile, "101 Codex codex\n202 Claude claude code\n", "utf8");

  const start = await runKlemm(["dogfood", "ultimate", "start", "--id", "mission-ultimate", "--goal", "Build true Klemm"], { env });
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /Klemm ultimate dogfood started/);

  await runKlemm(["adapters", "dogfood", "--suite", "95", "--fake-home", home, "--mission", "mission-ultimate", "--goal", "goal-mission-ultimate"], { env });
  const blocked = await runKlemm(["dogfood", "ultimate", "finish", "--mission", "mission-ultimate"], { env });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /Klemm ultimate dogfood finish blocked/);
  assert.match(blocked.stdout, /fake_adapter_evidence=blocked/);
  assert.match(blocked.stdout, /live_adapter_evidence=missing/);

  await runKlemm(["daemon", "ensure", "--data-dir", dataDir, "--dry-run"], { env });
  await runKlemm(["helper", "follow", "--mission", "mission-ultimate", "--process-file", processFile, "--frontmost-app", "Codex", "--watch-path", "src"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-ultimate-proceed", "--text", "Kyle uses proceed to continue safe local implementation with tests and debrief."], { env });
  await runKlemm(["afk", "start", "--id", "mission-ultimate", "--goal", "Build true Klemm", "--agent", "codex", "--", "node", "-e", "console.log('ultimate proof')"], { env });
  for (const [type, summary] of [["session_start", "live"], ["plan", "live"], ["tool_call", "live"], ["file_change", "live"], ["debrief", "live"], ["session_finish", "live"]]) {
    await runKlemm(["codex", "report", "--mission", "mission-ultimate", "--type", type, "--summary", `Codex ${summary} ${type}`, "--file", "src/klemm-cli.js"], { env });
  }
  await runKlemm(["adapters", "prove", "--live", "codex", "--mission", "mission-ultimate"], { env });
  await runKlemm(["trust", "why", "--autopilot", "autopilot-tick-mission-ultimate-1", "--v6"], { env });
  await runKlemm(["security", "adversarial-test", "--suite", "ultimate"], { env });
  await runKlemm(["sync", "hosted", "init", "--url", `file://${join(dataDir, "sync-server")}`, "--token", "dogfood-token"], { env });
  await runKlemm(["sync", "hosted", "push", "--encrypted"], { env });
  await runKlemm(["supervise", "--mission", "mission-ultimate", "--watch", "--capture", "--record-tree", "--", "node", "-e", "console.log('verification')"], { env });

  const checkpoint = await runKlemm(["dogfood", "ultimate", "checkpoint", "--mission", "mission-ultimate"], { env });
  assert.match(checkpoint.stdout, /Klemm ultimate dogfood checkpoint/);
  assert.match(checkpoint.stdout, /live_adapter_evidence=present/);
  assert.match(checkpoint.stdout, /trust_v6=present/);
  assert.match(checkpoint.stdout, /ultimate_maturity=missing/);

  const finish = await runKlemm(["dogfood", "ultimate", "finish", "--mission", "mission-ultimate"], { env });
  assert.equal(finish.status, 2);
  assert.match(finish.stdout, /Klemm ultimate dogfood finish blocked/);
  assert.match(finish.stdout, /ultimate_maturity=missing/);
});
