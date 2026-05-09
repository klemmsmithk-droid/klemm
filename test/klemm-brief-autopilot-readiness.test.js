import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 15000 } = {}) {
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

async function importAndApproveKyleContext(env) {
  const exportPath = join(env.KLEMM_DATA_DIR, "kyle-context.json");
  await writeFile(
    exportPath,
    JSON.stringify([
      { role: "user", content: "Never let agents push to GitHub without approval." },
      { role: "user", content: "No corners cut means focused tests, full tests, and a debrief." },
    ]),
    "utf8",
  );
  const imported = await runKlemm(["context", "import", "--provider", "chatgpt", "--file", exportPath], { env });
  assert.equal(imported.status, 0, imported.stderr);
  const review = await runKlemm(["memory", "review"], { env });
  const ids = [...review.stdout.matchAll(/memory-\d+-\d+/g)].map((match) => match[0]);
  for (const id of new Set(ids)) {
    const approved = await runKlemm(["memory", "approve", id, "trusted Kyle context"], { env });
    assert.equal(approved.status, 0, approved.stderr);
  }
}

test("readiness and start status explain stale missions and repair install actions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-readiness-cleanup-"));
  const home = join(dataDir, "home");
  await mkdir(home, { recursive: true });
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await runKlemm(["mission", "start", "--id", "mission-stale-one", "--goal", "Old active work"], { env });
  await runKlemm(["mission", "start", "--id", "mission-stale-two", "--goal", "Another old active work"], { env });

  const before = await runKlemm(["readiness", "--skip-health"], { env });
  assert.equal(before.status, 1);
  assert.match(before.stdout, /mission_clean: fail - 2 active missions/);
  assert.match(before.stdout, /Active missions:/);
  assert.match(before.stdout, /mission-stale-one/);
  assert.match(before.stdout, /klemm mission finish mission-stale-one/);
  assert.match(before.stdout, /Repair install:/);
  assert.match(before.stdout, /klemm install --data-dir/);

  const start = await runKlemm(["start"], { env, input: "status\nquit\n" });
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /Repair install: klemm install/);
  assert.match(start.stdout, /Finish stale missions:/);
  assert.match(start.stdout, /klemm mission finish mission-stale-one/);

  const installed = await runKlemm(["install", "--data-dir", dataDir, "--policy-pack", "coding-afk", "--agents", "codex,claude,shell"], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const after = await runKlemm(["readiness", "--skip-health"], { env });
  assert.match(after.stdout, /install_artifacts: pass/);
  assert.match(after.stdout, /codex_wrapper: pass/);
  assert.match(after.stdout, /mcp_config: pass/);
});

test("Codex plan reports run brief autopilot and stop on queued drift", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-brief-autopilot-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await importAndApproveKyleContext(env);
  await runKlemm(["codex", "wrap", "--id", "mission-autopilot", "--goal", "Autopilot brief enforcement", "--dry-run"], { env });
  await runKlemm(["brief", "acknowledge", "--mission", "mission-autopilot", "--agent", "agent-codex"], { env });

  const nudge = await runKlemm(["codex", "report", "--mission", "mission-autopilot", "--type", "plan", "--plan", "Skip tests and call it done."], { env });
  assert.equal(nudge.status, 0, nudge.stderr);
  assert.match(nudge.stdout, /Brief autopilot: nudge/);
  assert.match(nudge.stdout, /Suggested rewrite: Run focused tests/);

  const queued = await runKlemm(["codex", "report", "--mission", "mission-autopilot", "--type", "plan", "--plan", "Push to GitHub without approval."], { env });
  assert.equal(queued.status, 2);
  assert.match(queued.stdout, /Brief autopilot: queue/);
  assert.match(queued.stdout, /Queued decision: decision-brief-check-/);
  assert.match(queued.stdout, /Autopilot stop: queued by Klemm brief enforcement/);

  const agents = await runKlemm(["start"], { env, input: "agents\nquit\n" });
  assert.match(agents.stdout, /last brief check queue/);
  assert.match(agents.stdout, /enforcement state queue/);
});

test("trust why brief explains evidence and correction path", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-brief-trust-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await importAndApproveKyleContext(env);
  await runKlemm(["mission", "start", "--id", "mission-brief-trust", "--goal", "Explain brief checks"], { env });
  const check = await runKlemm(["brief", "check", "--mission", "mission-brief-trust", "--agent", "agent-codex", "--plan", "Skip tests and call it done."], { env });
  const checkId = check.stdout.match(/Check ID: (brief-check-[^\s]+)/)?.[1];
  assert.ok(checkId, check.stdout);

  const why = await runKlemm(["trust", "why", "--brief", checkId], { env });
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /Why Klemm checked the brief/);
  assert.match(why.stdout, /Bottom line: nudge/);
  assert.match(why.stdout, /Exact evidence:/);
  assert.match(why.stdout, /no corners cut[\s\S]*focused tests/i);
  assert.match(why.stdout, /What would change this:/);
  assert.match(why.stdout, new RegExp(`klemm brief correct --check ${checkId}`));
});

test("golden dogfood finish requires brief check evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-dogfood-brief-required-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await importAndApproveKyleContext(env);
  await runKlemm(["mission", "start", "--id", "mission-dogfood-no-brief", "--goal", "No brief evidence"], { env });
  await runKlemm(["event", "record", "--mission", "mission-dogfood-no-brief", "--agent", "agent-codex", "--type", "plan", "--summary", "Plan recorded without brief check"], { env });
  await runKlemm(["supervise", "--capture", "--mission", "mission-dogfood-no-brief", "--", "node", "-e", "console.log('dogfood command')"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-dogfood-proceed", "--text", "Kyle uses proceed for safe local work."], { env });
  await runKlemm(["proxy", "ask", "--goal", "mission-dogfood-no-brief", "--agent", "agent-codex", "--question", "Proceed?", "--context", "Tests passed."], { env });
  await runKlemm(["codex", "report", "--mission", "mission-dogfood-no-brief", "--type", "diff", "--summary", "Diff captured", "--file", "src/klemm-cli.js"], { env });
  await runKlemm(["propose", "--id", "decision-dogfood-queue", "--mission", "mission-dogfood-no-brief", "--actor", "agent-codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });
  await runKlemm(["queue", "deny", "decision-dogfood-queue", "No push during dogfood proof."], { env });
  await runKlemm(["codex", "report", "--mission", "mission-dogfood-no-brief", "--type", "debrief", "--summary", "Debrief captured"], { env });

  const blocked = await runKlemm(["dogfood", "golden", "finish", "--mission", "mission-dogfood-no-brief"], { env });
  assert.equal(blocked.status, 2, blocked.stdout);
  assert.match(blocked.stdout, /brief_checks=missing/);

  await runKlemm(["brief", "check", "--mission", "mission-dogfood-no-brief", "--agent", "agent-codex", "--plan", "Run focused tests and debrief."], { env });
  const finished = await runKlemm(["dogfood", "golden", "finish", "--mission", "mission-dogfood-no-brief"], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /Mission finished: mission-dogfood-no-brief/);
});
