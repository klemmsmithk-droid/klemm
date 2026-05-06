import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 30000 } = {}) {
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

test("klemm start --mission renders the 90 percent daily command center", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-90-"));
  const psFile = join(dataDir, "ps.txt");
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(psFile, "101 Codex codex --ask-for-approval on-request\n202 Claude claude code\n", "utf8");
  await runKlemm(["dogfood", "90", "start", "--id", "mission-start-90", "--goal", "Run the real daily Klemm loop"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-start-90", "--text", "Kyle uses proceed to continue safe local implementation with tests and debrief."], { env });
  await runKlemm(["helper", "follow", "--mission", "mission-start-90", "--process-file", psFile, "--frontmost-app", "Codex"], { env });
  await runKlemm(["afk", "start", "--id", "mission-start-90", "--goal", "Run the real daily Klemm loop", "--agent", "codex", "--", "node", "-e", "console.log('start 90')"], { env });
  await runKlemm(["trust", "why", "--autopilot", "autopilot-tick-mission-start-90-1", "--v5"], { env });

  const result = await runKlemm(["start", "--mission", "mission-start-90"], { env, input: "status\nquit\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Klemm 90 Home/);
  assert.match(result.stdout, /Mission: mission-start-90/);
  assert.match(result.stdout, /AFK: running continue/);
  assert.match(result.stdout, /Helper: running healthy/);
  assert.match(result.stdout, /Agents: Codex: live, supervised, autopilot on/);
  assert.match(result.stdout, /Queue: 0 unresolved/);
  assert.match(result.stdout, /Memory: Kyle Profile Card/);
  assert.match(result.stdout, /Trust: v5 autopilot-tick-mission-start-90-1/);
  assert.match(result.stdout, /Next action: klemm afk next --mission mission-start-90/);
});
