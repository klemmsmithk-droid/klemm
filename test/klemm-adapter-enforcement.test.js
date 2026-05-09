import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 10000 } = {}) {
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

test("real adapter installers write enforcement-first Claude hooks and Cursor rules", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-enforce-install-"));
  const home = join(dataDir, "home");
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(join(home, ".claude", "settings.json"), "{}\n", "utf8");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };

  const install = await runKlemm(["adapters", "install", "--real", "claude", "--home", home], { env });
  assert.equal(install.status, 0, install.stderr);
  await runKlemm(["adapters", "install", "--real", "cursor", "--home", home], { env });

  const claudeSettings = await readFile(join(home, ".claude", "settings.json"), "utf8");
  assert.match(claudeSettings, /SessionStart/);
  assert.match(claudeSettings, /UserPromptSubmit/);
  assert.match(claudeSettings, /PreToolUse/);
  assert.match(claudeSettings, /PostToolUse/);
  assert.match(claudeSettings, /Stop/);
  assert.match(claudeSettings, /SubagentStop/);
  assert.match(claudeSettings, /SessionEnd/);
  assert.match(claudeSettings, /klemm adapters hook claude/);

  const cursorMcp = await readFile(join(home, ".cursor", "mcp.json"), "utf8");
  const cursorRules = await readFile(join(home, ".cursor", "rules", "klemm.mdc"), "utf8");
  assert.match(cursorMcp, /klemm-mcp-server/);
  assert.match(cursorRules, /proxy_ask/);
  assert.match(cursorRules, /request_authority/);
  assert.match(cursorRules, /record_adapter_envelope/);
});

test("agent shim injects proxy commands, captures output, and records proceed questions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-agent-shim-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["goal", "start", "--id", "goal-shell-shim", "--text", "Run shell shim", "--success", "proxy routed"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-shell-proceed", "--text", "Kyle uses proceed and what's next to mean continue safe local implementation work."], { env });

  const shim = await runKlemm([
    "agent",
    "shim",
    "--goal",
    "goal-shell-shim",
    "--agent",
    "agent-shell",
    "--capture",
    "--",
    "node",
    "-e",
    "console.log('Should I proceed with the next safe local step?')",
  ], { env });
  assert.equal(shim.status, 0, shim.stderr);
  assert.match(shim.stdout, /Klemm agent shim/);
  assert.match(shim.stdout, /KLEMM_PROXY_ASK_COMMAND/);
  assert.match(shim.stdout, /Proxy question routed:/);
  assert.match(shim.stdout, /Klemm supervised exit: 0/);

  const status = await runKlemm(["proxy", "status", "--goal", "goal-shell-shim"], { env });
  assert.match(status.stdout, /Questions: 1/);
  assert.match(status.stdout, /continue=yes/);
});

test("adapter doctor live reports installed, live, missing, and shim states", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-doctor-live-"));
  const home = join(dataDir, "home");
  await mkdir(join(home, ".codex"), { recursive: true });
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await runKlemm(["mission", "start", "--id", "mission-adapter-live", "--goal", "Check live adapters"], { env });
  await runKlemm(["adapters", "install", "--real", "codex", "--home", home], { env });
  await runKlemm(["adapters", "install", "--real", "claude", "--home", home], { env });
  await runKlemm(["codex", "report", "--mission", "mission-adapter-live", "--type", "plan", "--summary", "Codex live"], { env });

  const doctor = await runKlemm(["adapters", "doctor", "--live", "--mission", "mission-adapter-live", "--home", home], { env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /codex: installed and reporting/);
  assert.match(doctor.stdout, /claude: hooks installed but not seen live/);
  assert.match(doctor.stdout, /cursor: MCP config missing/);
  assert.match(doctor.stdout, /shell: shim available/);
});

test("adapter timeline TUI shows proxy questions, decisions, activity, and continuations", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-timeline-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["goal", "start", "--id", "goal-adapter-timeline", "--text", "Render adapter timeline", "--success", "timeline visible"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-timeline-proceed", "--text", "Kyle uses proceed to continue safe local implementation work."], { env });
  await runKlemm(["proxy", "ask", "--goal", "goal-adapter-timeline", "--agent", "agent-codex", "--question", "Should I proceed?", "--context", "The user said proceed."], { env });
  await runKlemm(["codex", "report", "--mission", "mission-goal-adapter-timeline", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  await runKlemm(["proxy", "continue", "--goal", "goal-adapter-timeline", "--agent", "agent-codex"], { env });

  const tui = await runKlemm(["tui", "--view", "adapters", "--mission", "mission-goal-adapter-timeline"], { env });
  assert.equal(tui.status, 0, tui.stderr);
  assert.match(tui.stdout, /Adapter Event Timeline/);
  assert.match(tui.stdout, /proxy_question/);
  assert.match(tui.stdout, /proxy_answer/);
  assert.match(tui.stdout, /activity_tool_call/);
  assert.match(tui.stdout, /proxy_continuation/);
});
