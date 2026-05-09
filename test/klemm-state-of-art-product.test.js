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

test("LaunchAgent reliability status repairs stale plist logs and records operator guidance", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-launchagent-reliability-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });

  const status = await runKlemm(["daemon", "launch-agent", "status", "--data-dir", dataDir, "--offline"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /LaunchAgent Reliability/);
  assert.match(status.stdout, /Plist: missing/);
  assert.match(status.stdout, /Repair: klemm daemon launch-agent repair/);

  const repair = await runKlemm(["daemon", "launch-agent", "repair", "--data-dir", dataDir, "--offline"], { env });
  assert.equal(repair.status, 0, repair.stderr);
  assert.match(repair.stdout, /LaunchAgent repair complete/);
  assert.match(repair.stdout, /Plist written:/);
  assert.match(repair.stdout, /Log rotation: bounded/);

  const healthy = await runKlemm(["daemon", "launch-agent", "status", "--data-dir", dataDir, "--offline"], { env });
  assert.match(healthy.stdout, /Plist: installed/);
  assert.match(healthy.stdout, /Logs: ready/);
  assert.match(healthy.stdout, /Recovery: stale PID repair ready/);
});

test("packaged update plan and apply reinstall artifacts with a rollback note", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-package-update-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });

  const plan = await runKlemm(["update", "plan", "--data-dir", dataDir, "--target-version", "0.2.0"], { env });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /Klemm Update Plan/);
  assert.match(plan.stdout, /Target version: 0.2.0/);
  assert.match(plan.stdout, /Rollback:/);
  assert.match(plan.stdout, /No external network required/);

  const apply = await runKlemm(["update", "apply", "--data-dir", dataDir, "--target-version", "0.2.0", "--skip-health"], { env });
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /Klemm update applied/);
  assert.match(apply.stdout, /LaunchAgent repaired/);
  assert.match(apply.stdout, /Codex integration refreshed/);
  assert.match(apply.stdout, /Rollback manifest:/);
});

test("memory workbench review deck supports source preview actions and one-step promotion", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-memory-deck-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const sourceFile = join(dataDir, "chat.txt");
  await writeFile(sourceFile, "Kyle says proceed means continue the safe local plan. Never push while AFK.", "utf8");
  await runKlemm(["memory", "ingest", "--source", "chatgpt", "--file", sourceFile], { env });

  const deck = await runKlemm(["memory", "workbench", "deck", "--source-preview", "--why-trusted"], { env });
  assert.equal(deck.status, 0, deck.stderr);
  assert.match(deck.stdout, /Memory Review Deck/);
  assert.match(deck.stdout, /Next candidate:/);
  assert.match(deck.stdout, /Source preview:/);
  assert.match(deck.stdout, /Suggested actions:/);
  assert.match(deck.stdout, /approve:/);
  assert.match(deck.stdout, /promote:/);

  const memoryId = deck.stdout.match(/Next candidate: (memory-[^\s]+)/)?.[1];
  assert.ok(memoryId, deck.stdout);
  const promoted = await runKlemm(["memory", "workbench", "promote", memoryId, "--effect", "queue", "--action-types", "git_push,deployment"], { env });
  assert.equal(promoted.status, 0, promoted.stderr);
  assert.match(promoted.stdout, /Memory workbench action: promote/);
  assert.match(promoted.stdout, /Policy promoted:/);
});

test("trust report reads like a watch officer with evidence uncertainty and teach path", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-watch-report-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-watch", "--goal", "Build safely while Kyle is AFK"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-watch", "--text", "Kyle wants pushes, deploys, credentials, and external actions queued while AFK."], { env });
  await runKlemm(["propose", "--id", "decision-watch", "--mission", "mission-watch", "--actor", "agent-codex", "--type", "git_push", "--target", "git push origin main", "--external", "git_push"], { env });

  const report = await runKlemm(["trust", "report", "decision-watch"], { env });
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /Klemm Watch Report/);
  assert.match(report.stdout, /Watch officer summary:/);
  assert.match(report.stdout, /What happened:/);
  assert.match(report.stdout, /Why I intervened:/);
  assert.match(report.stdout, /Evidence I trusted:/);
  assert.match(report.stdout, /Evidence I ignored:/);
  assert.match(report.stdout, /Uncertainty:/);
  assert.match(report.stdout, /What I would do next:/);
  assert.match(report.stdout, /Teach Klemm:/);
  assert.match(report.stdout, /klemm corrections add --decision decision-watch/);
});
