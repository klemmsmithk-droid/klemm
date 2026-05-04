import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
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

test("continuous observer loop records repeated agent activity, risk hints, and trust timeline", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-true-60-observer-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const psFile = join(dataDir, "ps.txt");
  await writeFile(psFile, "PID COMM COMMAND\n101 codex codex --ask-for-approval on-request\n202 zsh /bin/zsh\n", "utf8");

  await runKlemm(["mission", "start", "--id", "mission-true-60", "--goal", "Build Klemm toward true final product"], { env });
  const started = await runKlemm([
    "observe",
    "loop",
    "start",
    "--id",
    "observer-true-60",
    "--mission",
    "mission-true-60",
    "--interval-ms",
    "500",
    "--watch-path",
    "src",
    "--expect-domain",
    "coding",
    "--frontmost-app",
    "Codex",
    "--process-file",
    psFile,
  ], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Continuous observer started: observer-true-60/);
  assert.match(started.stdout, /Mode: observe-and-recommend/);

  const onTrack = await runKlemm([
    "observe",
    "loop",
    "tick",
    "--id",
    "observer-true-60",
    "--process-file",
    psFile,
    "--frontmost-app",
    "Codex",
    "--changed-file",
    "src/klemm-cli.js",
    "--agent-output",
    "I am editing Klemm tests and running npm test",
  ], { env });
  assert.equal(onTrack.status, 0, onTrack.stderr);
  assert.match(onTrack.stdout, /Observer tick recorded:/);
  assert.match(onTrack.stdout, /alignment=on_track/);
  assert.match(onTrack.stdout, /helper_heartbeat/);

  const risky = await runKlemm([
    "observe",
    "loop",
    "tick",
    "--id",
    "observer-true-60",
    "--frontmost-app",
    "Safari",
    "--changed-file",
    "Downloads/random.csv",
    "--agent-output",
    "I am going to deploy production without asking",
  ], { env });
  assert.match(risky.stdout, /alignment=needs_review/);
  assert.match(risky.stdout, /risk_hint/);
  assert.match(risky.stdout, /recommendation=wrap_or_queue/);

  const status = await runKlemm(["observe", "loop", "status", "--id", "observer-true-60"], { env });
  assert.match(status.stdout, /Observer loop: running/);
  assert.match(status.stdout, /health=healthy/);
  assert.match(status.stdout, /ticks=2/);
  assert.match(status.stdout, /Recommendations:/);

  const timeline = await runKlemm(["trust", "timeline", "--mission", "mission-true-60"], { env });
  assert.match(timeline.stdout, /Trust timeline/);
  assert.match(timeline.stdout, /observer_tick/);
  assert.match(timeline.stdout, /risk_hint/);
  assert.match(timeline.stdout, /What Klemm thinks changed:/);
});

test("source evidence inventory renders user-model coverage and evidence drilldowns", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-true-60-memory-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["context", "import", "--provider", "chatgpt", "--source-ref", "chat-export", "--text", "Never deploy production without explicit approval.\nI prefer terminal-first tools."], { env });
  await runKlemm(["context", "import", "--provider", "chrome_history", "--source-ref", "browser-history", "--text", "https://chatgpt.com/c/klemm Klemm agent supervision research"], { env });
  await runKlemm(["context", "import", "--provider", "git_history", "--source-ref", "git-log", "--text", "commit abc123 Build Klemm observation loop"], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];
  await runKlemm(["memory", "approve", memoryId, "trusted"], { env });

  const sources = await runKlemm(["memory", "sources", "--coverage"], { env });
  assert.equal(sources.status, 0, sources.stderr);
  assert.match(sources.stdout, /Memory Source Inventory/);
  assert.match(sources.stdout, /Provider coverage:/);
  assert.match(sources.stdout, /chatgpt/);
  assert.match(sources.stdout, /chrome_history/);
  assert.match(sources.stdout, /git_history/);
  assert.match(sources.stdout, /User model coverage:/);

  const evidence = await runKlemm(["memory", "evidence", memoryId], { env });
  assert.match(evidence.stdout, /Source Evidence/);
  assert.match(evidence.stdout, /Memory:/);
  assert.match(evidence.stdout, /Trust reason:/);

  const model = await runKlemm(["user", "model", "--evidence", "--coverage"], { env });
  assert.match(model.stdout, /Evidence-backed user model/);
  assert.match(model.stdout, /User model coverage:/);
  assert.match(model.stdout, /authority_boundaries/);
});

test("adapter health summarizes live capability coverage from installs and envelopes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-true-60-adapters-"));
  const env = { KLEMM_DATA_DIR: dataDir, HOME: join(dataDir, "home") };

  await runKlemm(["mission", "start", "--id", "mission-adapter-health", "--goal", "Exercise adapters"], { env });
  await runKlemm(["adapters", "install", "--all"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-adapter-health", "--type", "plan", "--summary", "Plan Klemm work"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-adapter-health", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-adapter-health", "--type", "diff", "--summary", "Changed CLI and tests"], { env });

  const health = await runKlemm(["adapters", "health", "--mission", "mission-adapter-health", "--require", "codex,claude,cursor,shell"], { env });
  assert.equal(health.status, 0, health.stderr);
  assert.match(health.stdout, /Live adapter health/);
  assert.match(health.stdout, /codex: live/);
  assert.match(health.stdout, /claude: installed/);
  assert.match(health.stdout, /cursor: installed/);
  assert.match(health.stdout, /Capability coverage:/);
  assert.match(health.stdout, /reports_session_lifecycle/);
});

test("true final product score reaches 60 only when observer, memory, adapters, trust, and security rails are present", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-true-60-score-"));
  const env = { KLEMM_DATA_DIR: dataDir, HOME: join(dataDir, "home") };
  const psFile = join(dataDir, "ps.txt");
  await writeFile(psFile, "PID COMM COMMAND\n101 codex codex --ask-for-approval on-request\n", "utf8");

  await runKlemm(["dogfood", "day", "start", "--id", "mission-score", "--goal", "Score true Klemm", "--domains", "coding,memory", "--watch-path", "src", "--memory-source", "codex-history", "--policy-pack", "coding-afk", "--dry-run", "--", "node", "-e", "console.log('score')"], { env });
  await runKlemm(["helper", "stream", "start", "--mission", "mission-score", "--process-file", psFile, "--frontmost-app", "Codex", "--watch-path", "src"], { env });
  await runKlemm(["observe", "loop", "start", "--id", "observer-score", "--mission", "mission-score", "--process-file", psFile, "--frontmost-app", "Codex", "--watch-path", "src", "--expect-domain", "coding"], { env });
  await runKlemm(["observe", "loop", "tick", "--id", "observer-score", "--process-file", psFile, "--frontmost-app", "Codex", "--changed-file", "src/klemm.js", "--agent-output", "Running tests"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--text", "Never deploy production without explicit approval.\nI prefer terminal-first tools."], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];
  await runKlemm(["memory", "approve", memoryId, "trusted"], { env });
  await runKlemm(["memory", "promote-policy", memoryId, "--action-types", "deployment", "--target-includes", "production"], { env });
  await runKlemm(["adapters", "install", "--all"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-score", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  await runKlemm(["propose", "--id", "decision-score", "--mission", "mission-score", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment"], { env });
  await runKlemm(["trust", "why", "decision-score"], { env });
  await runKlemm(["security", "adversarial-test"], { env });
  await runKlemm(["daemon", "token", "generate", "--output", join(dataDir, "daemon.token"), "--passphrase", "pw"], { env });

  const score = await runKlemm(["true-score", "--target", "60"], { env });
  assert.equal(score.status, 0, score.stderr);
  assert.match(score.stdout, /Klemm true final product score/);
  assert.match(score.stdout, /Score: 60%/);
  assert.match(score.stdout, /continuous_observation: pass/);
  assert.match(score.stdout, /user_model_depth: pass/);
  assert.match(score.stdout, /adapter_reality: pass/);
  assert.match(score.stdout, /trust_explainability: pass/);
  assert.match(score.stdout, /security_lifecycle: pass/);
});
