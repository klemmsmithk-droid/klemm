import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 8000 } = {}) {
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

test("Claude real installer uses documented hook events and routes JSON hook input to Klemm", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-claude-hooks-data-"));
  const home = await mkdtemp(join(tmpdir(), "klemm-claude-hooks-home-"));
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, KLEMM_MISSION_ID: "mission-claude-live" };

  const install = await runKlemm(["adapters", "install", "--real", "claude", "--home", home], { env });
  assert.equal(install.status, 0, install.stderr);
  const settings = await readFile(join(home, ".claude", "settings.json"), "utf8");
  assert.match(settings, /SessionStart/);
  assert.match(settings, /UserPromptSubmit/);
  assert.match(settings, /PreToolUse/);
  assert.match(settings, /PostToolUse/);
  assert.match(settings, /SubagentStop/);
  assert.match(settings, /SessionEnd/);
  assert.match(settings, /klemm adapters hook claude/);

  const start = await runKlemm(["adapters", "hook", "claude"], {
    env,
    input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "claude-session-1", cwd: process.cwd() }),
  });
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /"continue":true/);

  const prompt = await runKlemm(["adapters", "hook", "claude"], {
    env,
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "claude-session-1", prompt: "Proceed with safe local tests." }),
  });
  assert.equal(prompt.status, 0, prompt.stderr);
  assert.match(prompt.stdout, /"continue":true/);

  const risky = await runKlemm(["adapters", "hook", "claude"], {
    env,
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "claude-session-1",
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
    }),
  });
  assert.equal(risky.status, 0, risky.stderr);
  assert.match(risky.stdout, /"decision":"block"/);
  assert.match(risky.stdout, /"reason":/);
  assert.doesNotMatch(risky.stdout, /sk-[A-Za-z0-9]/);

  for (const event of [
    ["PostToolUse", { tool_name: "Bash", tool_response: "tests passed" }],
    ["Stop", { transcript_path: "/tmp/claude-transcript.jsonl" }],
    ["SessionEnd", {}],
  ]) {
    const result = await runKlemm(["adapters", "hook", "claude"], {
      env,
      input: JSON.stringify({ hook_event_name: event[0], session_id: "claude-session-1", ...event[1] }),
    });
    assert.equal(result.status, 0, result.stderr);
  }

  const proof = await runKlemm(["adapters", "prove", "--live", "claude", "--mission", "mission-claude-live"], { env });
  assert.equal(proof.status, 0, proof.stdout);
  assert.match(proof.stdout, /Ultimate evidence: live/);
  assert.match(proof.stdout, /session_start=yes/);
  assert.match(proof.stdout, /plan=yes/);
  assert.match(proof.stdout, /tool_call=yes/);
  assert.match(proof.stdout, /authority_decision=yes/);
  assert.match(proof.stdout, /session_finish=yes/);
});
