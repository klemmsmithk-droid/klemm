import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 15000 } = {}) {
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

test("adapter compliance scores live proxy, authority, capture, diff, and debrief evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-compliance-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["goal", "start", "--id", "goal-compliance", "--text", "Prove adapter compliance", "--success", "score visible"], { env });
  await runKlemm(["adapters", "install", "--all"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-compliance-proceed", "--text", "Kyle uses proceed to continue safe local implementation work."], { env });
  await runKlemm(["proxy", "ask", "--goal", "goal-compliance", "--agent", "agent-codex", "--question", "Should I proceed?", "--context", "The user said proceed."], { env });
  await runKlemm(["codex", "report", "--mission", "mission-goal-compliance", "--type", "plan", "--summary", "Codex live plan"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-goal-compliance", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-goal-compliance", "--type", "diff", "--summary", "Diff reported", "--files", "src/klemm-cli.js"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-goal-compliance", "--type", "debrief", "--summary", "Debrief emitted"], { env });
  await runKlemm(["agent", "shim", "--goal", "goal-compliance", "--agent", "agent-shell", "--capture", "--", "node", "-e", "console.log('safe shell proof')"], { env });

  const compliance = await runKlemm(["adapters", "compliance", "--mission", "mission-goal-compliance", "--require", "codex,shell"], { env });
  assert.equal(compliance.status, 0, compliance.stderr);
  assert.match(compliance.stdout, /Adapter Compliance/);
  assert.match(compliance.stdout, /codex: 8\/8/);
  assert.match(compliance.stdout, /shell: 8\/8/);
  assert.match(compliance.stdout, /proxy_usage=yes/);
  assert.match(compliance.stdout, /authority_usage=yes/);
  assert.match(compliance.stdout, /diff_reporting=yes/);
  assert.match(compliance.stdout, /debrief=yes/);
});

test("Claude hook smoke executes generated lifecycle proof with fake hook env", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-claude-smoke-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["goal", "start", "--id", "goal-claude-smoke", "--text", "Smoke Claude hooks", "--success", "all hooks proofed"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-claude-proceed", "--text", "Kyle uses proceed to continue safe local implementation work."], { env });
  await runKlemm(["adapters", "install", "--real", "claude", "--home", home], { env });

  const smoke = await runKlemm(["adapters", "smoke", "claude", "--mission", "mission-goal-claude-smoke", "--goal", "goal-claude-smoke", "--home", home], { env });
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.match(smoke.stdout, /Claude hook smoke/);
  assert.match(smoke.stdout, /SessionStart: passed/);
  assert.match(smoke.stdout, /PreToolUse: passed/);
  assert.match(smoke.stdout, /PostToolUse: passed/);
  assert.match(smoke.stdout, /Stop: passed/);
  assert.match(smoke.stdout, /SessionEnd: passed/);

  const timeline = await runKlemm(["tui", "--view", "adapters", "--mission", "mission-goal-claude-smoke"], { env });
  assert.match(timeline.stdout, /agent-claude/);
  assert.match(timeline.stdout, /proxy_question/);
  assert.match(timeline.stdout, /proxy_continuation/);
});

test("Cursor live config probe validates MCP config, rules, and required tools", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-cursor-live-probe-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["adapters", "install", "--real", "cursor", "--home", home], { env });

  const probe = await runKlemm(["adapters", "probe", "cursor", "--live", "--home", home], { env });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /Cursor live probe/);
  assert.match(probe.stdout, /MCP config: ok/);
  assert.match(probe.stdout, /Rules: ok/);
  assert.match(probe.stdout, /Required tools: proxy_ask,request_authority,record_adapter_envelope/);
  assert.match(probe.stdout, /klemm-mcp-server/);
});

test("dogfood adapters runs one-command multi-adapter proof and leaves queue clean", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-dogfood-adapters-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });

  const dogfood = await runKlemm(["dogfood", "adapters", "--goal", "Prove adapters obey Klemm", "--home", home], { env }, 20000);
  assert.equal(dogfood.status, 0, dogfood.stderr);
  assert.match(dogfood.stdout, /Klemm adapter dogfood/);
  assert.match(dogfood.stdout, /Codex live: pass/);
  assert.match(dogfood.stdout, /Claude hooks: pass/);
  assert.match(dogfood.stdout, /Cursor config: pass/);
  assert.match(dogfood.stdout, /Shell shim: pass/);
  assert.match(dogfood.stdout, /Queue clean: pass/);
  assert.match(dogfood.stdout, /Adapter Compliance/);

  const queue = await runKlemm(["queue"], { env });
  assert.match(queue.stdout, /No queued decisions/);
});
