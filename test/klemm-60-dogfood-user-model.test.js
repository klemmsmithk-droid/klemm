import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 10000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
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
    child.stdin.end(input);
  });
}

test("dogfood day loop starts through Codex wrap, checkpoints, and finishes cleanly", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-day-loop-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const started = await runKlemm([
    "dogfood",
    "day",
    "start",
    "--id",
    "mission-day",
    "--goal",
    "Build a real daily loop",
    "--domains",
    "coding,memory",
    "--watch-path",
    "src",
    "--memory-source",
    "codex-history",
    "--policy-pack",
    "coding-afk",
    "--dry-run",
    "--",
    "node",
    "-e",
    "console.log('wrapped')",
  ], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm dogfood day started: mission-day/);
  assert.match(started.stdout, /Codex wrapper session started: mission-day/);
  assert.match(started.stdout, /Domains: coding,memory/);

  await runKlemm(["codex", "report", "--mission", "mission-day", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  const checkpoint = await runKlemm(["dogfood", "day", "checkpoint", "--mission", "mission-day"], { env });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.match(checkpoint.stdout, /Klemm dogfood day checkpoint/);
  assert.match(checkpoint.stdout, /What Klemm thinks I'm doing: Build a real daily loop/);
  assert.match(checkpoint.stdout, /Recent activity:/);
  assert.match(checkpoint.stdout, /Open queue: 0/);

  const finished = await runKlemm(["dogfood", "day", "finish", "--mission", "mission-day", "--note", "day complete"], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /Daily dogfood debrief/);
  assert.match(finished.stdout, /Remaining follow-ups:/);
  assert.match(finished.stdout, /Mission finished: mission-day/);
  assert.match(finished.stdout, /Live state: clean/);
});

test("helper stream lifecycle records normalized observation events and stale status", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-helper-stream-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const processFile = join(dataDir, "ps.txt");
  await writeFile(processFile, `
PID COMM COMMAND
101 codex codex --full-auto
202 zsh /bin/zsh
`, "utf8");

  const started = await runKlemm([
    "helper",
    "stream",
    "start",
    "--mission",
    "mission-helper-stream",
    "--process-file",
    processFile,
    "--frontmost-app",
    "Codex",
    "--watch-path",
    "src",
  ], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Helper stream started:/);
  assert.match(started.stdout, /Events recorded: 5/);

  const status = await runKlemm(["helper", "stream", "status", "--mission", "mission-helper-stream"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Helper stream: running/);
  assert.match(status.stdout, /health=healthy/);
  assert.match(status.stdout, /agent_session_detected/);
  assert.match(status.stdout, /frontmost_app_changed/);

  const stale = await runKlemm(["helper", "stream", "status", "--mission", "mission-helper-stream", "--stale-after-ms", "0"], { env });
  assert.match(stale.stdout, /health=stale/);

  const stopped = await runKlemm(["helper", "stream", "stop", "--mission", "mission-helper-stream"], { env });
  assert.match(stopped.stdout, /Helper stream stopped:/);
});

test("memory workbench and correction lifecycle promote learned preferences into future decisions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-workbench-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-workbench", "--goal", "Improve model"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--text", "Never deploy production without explicit approval."], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];

  const workbench = await runKlemm(["tui", "--view", "workbench", "--search", "deploy", "--source-preview"], { env });
  assert.equal(workbench.status, 0, workbench.stderr);
  assert.match(workbench.stdout, /Memory Workbench/);
  assert.match(workbench.stdout, /Commands: next, prev, open, source, approve, reject, pin, promote, search, filter, corrections, queue/);
  assert.match(workbench.stdout, /Source Preview/);
  assert.match(workbench.stdout, /Correction Inbox/);

  const interactive = await runKlemm(["tui", "--interactive", "--view", "workbench"], {
    env,
    input: `open ${memoryId}\nsource ${memoryId}\napprove ${memoryId} reviewed\npromote ${memoryId} --action-types deployment --target-includes production\nquit\n`,
  });
  assert.equal(interactive.status, 0, interactive.stderr);
  assert.match(interactive.stdout, /Memory detail:/);
  assert.match(interactive.stdout, /Source Evidence/);
  assert.match(interactive.stdout, /Memory reviewed:/);
  assert.match(interactive.stdout, /Policy promoted:/);

  await runKlemm(["propose", "--id", "decision-correction-seed", "--mission", "mission-workbench", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment"], { env });
  const added = await runKlemm(["corrections", "add", "--decision", "decision-correction-seed", "--preference", "Queue production deploys when I am away"], { env });
  const correctionId = added.stdout.match(/correction-\d+/)[0];
  assert.match(added.stdout, /Memory candidate: pending_review/);

  const approved = await runKlemm(["corrections", "approve", correctionId, "reviewed"], { env });
  assert.match(approved.stdout, /Correction reviewed: .* approved/);
  const promoted = await runKlemm(["corrections", "promote", correctionId, "--action-types", "deployment", "--target-includes", "production"], { env });
  assert.match(promoted.stdout, /Correction promoted:/);

  await runKlemm(["propose", "--id", "decision-learned", "--mission", "mission-workbench", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment"], { env });
  const why = await runKlemm(["trust", "why", "decision-learned"], { env });
  assert.match(why.stdout, /Top matched preference:/);
  assert.match(why.stdout, /correction-derived policy/);
  assert.match(why.stdout, /What would make this allowed:/);
  assert.match(why.stdout, /Uncertainty:/);

  const model = await runKlemm(["user", "model", "--evidence"], { env });
  assert.match(model.stdout, /Evidence-backed user model/);
  assert.match(model.stdout, /Recent corrections:/);
  assert.match(model.stdout, /Source-backed authority boundaries:/);
});

test("daemon strict doctor verifies encrypted tokens, helper stream health, adapters, and log rotation", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-strict-doctor-"));
  const home = join(dataDir, "home");
  const logsDir = join(dataDir, "logs");
  await mkdir(logsDir, { recursive: true });
  await writeFile(join(logsDir, "klemm-daemon.log"), "token=[REDACTED]\n", "utf8");
  await writeFile(join(logsDir, "klemm-helper.log"), "helper ok\n", "utf8");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  const tokenFile = join(dataDir, "daemon.token");

  await runKlemm(["daemon", "token", "generate", "--output", tokenFile, "--passphrase", "pw"], { env });
  await runKlemm(["adapters", "install", "--real", "codex", "--home", home], { env });
  await runKlemm(["helper", "stream", "start", "--mission", "mission-strict", "--frontmost-app", "Codex"], { env });

  const strict = await runKlemm(["daemon", "doctor", "--strict", "--skip-health", "--token-file", tokenFile, "--token-passphrase", "pw", "--home", home], { env });
  assert.equal(strict.status, 0, strict.stderr);
  assert.match(strict.stdout, /Klemm doctor strict/);
  assert.match(strict.stdout, /Token decrypt: ok/);
  assert.match(strict.stdout, /Helper stream: ok/);
  assert.match(strict.stdout, /Adapter configs: ok/);
  assert.match(strict.stdout, /Log rotation: ok/);
  assert.match(strict.stdout, /Schema version:/);

  await chmod(tokenFile, 0o644);
  const unsafe = await runKlemm(["daemon", "doctor", "--strict", "--skip-health", "--token-file", tokenFile, "--token-passphrase", "pw", "--home", home], { env });
  assert.match(unsafe.stdout, /Token file: warning/);
});
