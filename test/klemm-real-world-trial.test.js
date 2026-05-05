import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 20000 } = {}) {
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

test("real-world trial runs Codex through Klemm and honestly labels installed versus seen adapters", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-real-world-trial-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-real-trial-proceed", "--text", "Kyle uses proceed to continue safe local implementation after tests pass."], { env });

  const started = await runKlemm([
    "trial",
    "real-world",
    "start",
    "--id",
    "mission-real-world",
    "--goal",
    "Prove Klemm is supervising real agent work",
    "--home",
    home,
    "--",
    "node",
    "-e",
    "console.log('actual real-world codex')",
  ], { env });

  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Real World Agent Trial started/);
  assert.match(started.stdout, /Codex live proof: pass/);
  assert.match(started.stdout, /Adapter install audit: pass/);
  assert.match(started.stdout, /Truth labels: live means observed activity; installed means config exists but no session was seen/);
  assert.match(started.stdout, /actual real-world codex/);

  const status = await runKlemm(["trial", "real-world", "status", "--mission", "mission-real-world", "--home", home], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Real World Agent Trial/);
  assert.match(status.stdout, /Mission: mission-real-world/);
  assert.match(status.stdout, /Codex: live, supervised/);
  assert.match(status.stdout, /Claude: installed, not seen/);
  assert.match(status.stdout, /Cursor: MCP configured, not seen/);
  assert.match(status.stdout, /Shell: shim available/);
  assert.match(status.stdout, /Observed evidence:/);
  assert.match(status.stdout, /codex_session=yes/);
  assert.match(status.stdout, /claude_live=no/);
  assert.match(status.stdout, /cursor_live=no/);
  assert.match(status.stdout, /Next proof:/);
  assert.match(status.stdout, /klemm adapters proof claude/);

  const finished = await runKlemm(["trial", "real-world", "finish", "--mission", "mission-real-world", "--home", home], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /Real World Agent Trial debrief/);
  assert.match(finished.stdout, /Mission finished: mission-real-world/);
  assert.match(finished.stdout, /Live state: clean/);
});

test("real-world trial can include Claude and Cursor proof sessions when requested", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-real-world-proofed-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-real-proof-proceed", "--text", "Kyle uses proceed to continue safe local implementation after tests pass."], { env });

  const started = await runKlemm([
    "trial",
    "real-world",
    "start",
    "--id",
    "mission-real-proofed",
    "--goal",
    "Prove adapters under Klemm",
    "--home",
    home,
    "--prove",
    "claude,cursor",
    "--",
    "node",
    "-e",
    "console.log('codex proof body')",
  ], { env });

  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Claude proof: pass/);
  assert.match(started.stdout, /Cursor proof: pass/);

  const status = await runKlemm(["trial", "real-world", "status", "--mission", "mission-real-proofed", "--home", home], { env });
  assert.match(status.stdout, /Claude: live, hooks reporting/);
  assert.match(status.stdout, /Cursor: live, MCP reporting/);
  assert.match(status.stdout, /claude_live=yes/);
  assert.match(status.stdout, /cursor_live=yes/);
});
