import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { join } from "node:path";

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

test("klemm start opens a compact status front door", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-status-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const result = await runKlemm(["start"], { env, input: "status\nquit\n" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Klemm Start/);
  assert.match(result.stdout, /\x1b\[38;2;34;139;34m/);
  assert.match(result.stdout, /\x1b\[97m/);
  assert.match(result.stdout, /K\s+K\s+L\s+EEEEEE\s+M\s+M\s+M\s+M/);
  assert.doesNotMatch(result.stdout, /forest-green personal authority layer/i);
  assert.match(result.stdout, /1\. Status/);
  assert.match(result.stdout, /Klemm running:/);
  assert.match(result.stdout, /Daemon:/);
  assert.match(result.stdout, /Agent calls: 0/);
});

test("klemm start directions saves explicit user directions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-directions-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const result = await runKlemm(["start"], {
    env,
    input: "directions\nAlways ask before pushing to GitHub.\nquit\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Directions/);
  assert.match(result.stdout, /Type directions for Klemm/);
  assert.match(result.stdout, /Direction saved: direction-/);
  assert.match(result.stdout, /Always ask before pushing to GitHub\./);
});

test("klemm start context lists providers and records a connection request", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-context-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const result = await runKlemm(["start", "--no-open"], {
    env,
    input: "context\nchatgpt\nquit\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Context/);
  assert.match(result.stdout, /1\. ChatGPT/);
  assert.match(result.stdout, /2\. Claude/);
  assert.match(result.stdout, /3\. Gemini/);
  assert.match(result.stdout, /Official ChatGPT connector/);
  assert.match(result.stdout, /No public ChatGPT history OAuth flow/);
  assert.match(result.stdout, /ChatGPT data export/);
  assert.match(result.stdout, /OPENAI_API_KEY/);
  assert.match(result.stdout, /This setup stays in Klemm/);
  assert.match(result.stdout, /What to do now:/);
  assert.doesNotMatch(result.stdout, /https:\/\/help\.openai\.com/);
  assert.doesNotMatch(result.stdout, /Browser open:/);
  assert.match(result.stdout, /Connector saved: connector-chatgpt/);
  assert.match(result.stdout, /Connection request saved: context-connection-/);
  assert.doesNotMatch(result.stdout, /URL: https:\/\/chatgpt\.com\s/);

  const list = await runKlemm(["connectors", "list"], { env });
  assert.match(list.stdout, /chatgpt official needs_export_or_api/);
});

test("klemm start context providers are selectable with arrows and enter", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-context-arrows-"));
  const env = { KLEMM_DATA_DIR: dataDir, KLEMM_FORCE_INTERACTIVE: "1" };

  const result = await runKlemm(["start", "--no-open"], {
    env,
    input: "\x1b[B\x1b[B\n\x1b[B\x1b[B\n",
    timeoutMs: 5000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Context/);
  assert.match(result.stdout, /Use ↑\/↓ then Enter to choose a service/);
  assert.match(result.stdout, /> 3\. Gemini/);
  assert.match(result.stdout, /Opening Gemini connection/);
  assert.match(result.stdout, /https:\/\/gemini\.google\.com/);
  assert.match(result.stdout, /Browser open: skipped/);
  assert.match(result.stdout, /Connection request saved: context-connection-/);
  assert.doesNotMatch(result.stdout, /provider>/);
});

test("klemm start agents lists agents currently in use", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-agents-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-start-menu", "--goal", "Build through Klemm"], { env });
  await runKlemm(["agent", "register", "--id", "agent-codex", "--mission", "mission-start-menu", "--name", "Codex", "--kind", "codex_agent"], { env });

  const result = await runKlemm(["start"], { env, input: "agents\nquit\n" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Agents in use/);
  assert.match(result.stdout, /agent-codex/);
  assert.match(result.stdout, /Codex/);
  assert.match(result.stdout, /mission-start-menu/);
});

test("klemm start agents uses clean reader-friendly agent names", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-agent-clean-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-goal-klemm-goal-adapter-v1", "--goal", "Klemm goal adapter"], { env });
  await runKlemm(["agent", "register", "--id", "agent-codex-goal-adapter-v1", "--mission", "mission-goal-klemm-goal-adapter-v1", "--name", "agent-codex-goal-adapter-v1", "--kind", "codex_agent"], { env });
  await runKlemm(["agent", "register", "--id", "agent-runtime-shell", "--mission", "mission-goal-klemm-goals", "--name", "Shell Agent", "--kind", "shell_agent"], { env });

  const result = await runKlemm(["start"], { env, input: "agents\nquit\n" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\. Codex goal adapter/);
  assert.match(result.stdout, /Kind: Codex/);
  assert.match(result.stdout, /Mission: Klemm goal adapter/);
  assert.match(result.stdout, /ID: agent-codex-goal-adapter-v1/);
  assert.doesNotMatch(result.stdout, /- agent-codex-goal-adapter-v1 .* mission=/);
  assert.doesNotMatch(result.stdout, /kind=codex_agent/);
});

test("klemm start supports arrow-key selection for the main menu", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-arrow-agents-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-arrow-menu", "--goal", "Navigate Klemm"], { env });
  await runKlemm(["agent", "register", "--id", "agent-arrow", "--mission", "mission-arrow-menu", "--name", "Arrow Agent", "--kind", "shell_agent"], { env });

  const result = await runKlemm(["start"], {
    env,
    input: "\x1b[B\x1b[B\x1b[B\nquit\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Use ↑\/↓ then Enter/);
  assert.match(result.stdout, /Agents in use/);
  assert.match(result.stdout, /agent-arrow/);
});

test("klemm start clears the terminal before interactive arrow redraws", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-redraw-"));
  const env = { KLEMM_DATA_DIR: dataDir, KLEMM_FORCE_INTERACTIVE: "1" };

  const result = await runKlemm(["start"], {
    env,
    input: "\x1b[B",
    timeoutMs: 5000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\x1b\[2J\x1b\[H/);
  assert.match(result.stdout, /> 2\. Directions/);
});
