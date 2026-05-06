import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

test("klemm start exposes autopilot as the operator home base", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-start-afk-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["memory", "seed-proxy", "--id", "memory-start-afk", "--text", "Kyle says proceed means continue safe local implementation."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-start-tests", "--text", "Kyle expects tests and debrief before done."], { env });
  await runKlemm(["afk", "start", "--id", "mission-start-afk", "--goal", "Show AFK in start", "--agent", "codex", "--", "node", "-e", "console.log('start afk')"], { env });

  const result = await runKlemm(["start"], { env, input: "autopilot\nagents\nquit\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5\. Autopilot|Autopilot/);
  assert.match(result.stdout, /AFK Autopilot/);
  assert.match(result.stdout, /Current mission: mission-start-afk/);
  assert.match(result.stdout, /Last decision: continue/);
  assert.match(result.stdout, /Last prompt: Proceed toward/);
  assert.match(result.stdout, /Codex: live, supervised, autopilot on/);
});
