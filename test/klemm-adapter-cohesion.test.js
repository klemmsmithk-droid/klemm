import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 20000 } = {}) {
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

test("codex wrap is the blessed path and automatically captures proxy and what-Klemm-saw evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-blessed-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["memory", "seed-proxy", "--id", "memory-blessed-proceed", "--text", "Kyle uses proceed to continue safe local implementation after tests pass."], { env });

  const wrapped = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-codex-blessed",
    "--goal",
    "Bless the Codex path",
    "--plan",
    "Run a safe local proof.",
    "--",
    "node",
    "-e",
    "console.log('codex blessed proof')",
  ], { env });

  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.match(wrapped.stdout, /Blessed path: klemm codex wrap/);
  assert.match(wrapped.stdout, /Automatic proxy check: captured/);
  assert.match(wrapped.stdout, /Final debrief: automatic/);
  assert.match(wrapped.stdout, /What Klemm saw:/);
  assert.match(wrapped.stdout, /plans=1/);
  assert.match(wrapped.stdout, /proxy_questions=1/);
  assert.match(wrapped.stdout, /commands=1/);
  assert.match(wrapped.stdout, /debriefs=1/);

  const contract = await runKlemm(["codex", "contract", "status", "--mission", "mission-codex-blessed"], { env });
  assert.match(contract.stdout, /proxy_questions=yes/);
  assert.match(contract.stdout, /debriefs=yes/);
  assert.match(contract.stdout, /supervised_runs=yes/);
});

test("Claude and Cursor adapter proofs install, simulate lifecycle, and score compliance", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-agent-proofs-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["goal", "start", "--id", "goal-adapter-proof", "--text", "Prove real adapters", "--success", "proof score visible"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-proof-proceed", "--text", "Kyle uses proceed to continue safe local implementation work."], { env });

  const claude = await runKlemm(["adapters", "proof", "claude", "--mission", "mission-goal-adapter-proof", "--goal", "goal-adapter-proof", "--home", home], { env });
  assert.equal(claude.status, 0, claude.stderr);
  assert.match(claude.stdout, /Claude Code Adapter Proof/);
  assert.match(claude.stdout, /Install: pass/);
  assert.match(claude.stdout, /SessionStart: pass/);
  assert.match(claude.stdout, /PreToolUse: pass/);
  assert.match(claude.stdout, /PostToolUse: pass/);
  assert.match(claude.stdout, /Stop: pass/);
  assert.match(claude.stdout, /SessionEnd: pass/);
  assert.match(claude.stdout, /Compliance: \d\/8/);

  const cursor = await runKlemm(["adapters", "proof", "cursor", "--mission", "mission-goal-adapter-proof", "--goal", "goal-adapter-proof", "--home", home], { env });
  assert.equal(cursor.status, 0, cursor.stderr);
  assert.match(cursor.stdout, /Cursor Adapter Proof/);
  assert.match(cursor.stdout, /MCP config: pass/);
  assert.match(cursor.stdout, /Rules: pass/);
  assert.match(cursor.stdout, /Plan event: pass/);
  assert.match(cursor.stdout, /Tool call: pass/);
  assert.match(cursor.stdout, /Diff: pass/);
  assert.match(cursor.stdout, /Debrief: pass/);
  assert.match(cursor.stdout, /Compliance: \d\/8/);
});

test("adapter status dashboard and klemm start agents show clean live agent summaries", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-status-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["mission", "start", "--id", "mission-adapter-status", "--goal", "Show live adapters"], { env });
  await runKlemm(["adapters", "install", "--real", "codex", "--home", home], { env });
  await runKlemm(["adapters", "install", "--real", "claude", "--home", home], { env });
  await runKlemm(["adapters", "install", "--real", "cursor", "--home", home], { env });
  await runKlemm(["codex", "report", "--mission", "mission-adapter-status", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });

  const status = await runKlemm(["adapters", "status", "--mission", "mission-adapter-status", "--home", home], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Klemm Adapter Status/);
  assert.match(status.stdout, /Codex: live, supervised/);
  assert.match(status.stdout, /Claude: installed, not seen/);
  assert.match(status.stdout, /Cursor: MCP configured, not seen/);
  assert.match(status.stdout, /Shell: shim available/);
  assert.match(status.stdout, /Next fix:/);

  const start = await runKlemm(["start"], { env, input: "agents\nquit\n" });
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /Agents in use/);
  assert.match(start.stdout, /Codex: live, supervised/);
  assert.match(start.stdout, /Claude: installed, not seen/);
  assert.match(start.stdout, /Cursor: MCP configured, not seen/);
  assert.match(start.stdout, /Shell: shim available/);
  assert.doesNotMatch(start.stdout, /kind=codex_agent/);
});
