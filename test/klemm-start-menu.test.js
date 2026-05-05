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
  assert.match(result.stdout, /K\s+K\s+L\s+EEEEEE\s+M\s+M\s+M/);
  assert.match(result.stdout, /forest-green personal authority layer/i);
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
  assert.match(result.stdout, /Opening ChatGPT connection/);
  assert.match(result.stdout, /https:\/\/chatgpt\.com/);
  assert.match(result.stdout, /Browser open: skipped/);
  assert.match(result.stdout, /Connection request saved: context-connection-/);
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
