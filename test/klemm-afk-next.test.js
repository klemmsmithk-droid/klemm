import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
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

test("afk next answers what Kyle would say next from reviewed memory and records evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-afk-next-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["memory", "seed-proxy", "--id", "memory-next-proceed", "--text", "Kyle uses what's next and proceed to mean continue the next safe local implementation step."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-next-tests", "--text", "Kyle's no corners cut standard means focused tests, full verification, and debrief."], { env });

  const started = await runKlemm(["afk", "start", "--id", "mission-afk-next", "--goal", "Keep building Klemm safely", "--agent", "codex", "--", "node", "-e", "console.log('next proof')"], { env });
  assert.equal(started.status, 0, started.stderr);

  const next = await runKlemm(["afk", "next", "--mission", "mission-afk-next"], { env });
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, /Klemm AFK next/);
  assert.match(next.stdout, /Autopilot decision: continue/);
  assert.match(next.stdout, /Kyle-like continuation/);
  assert.match(next.stdout, /Next prompt: Proceed toward/);
  assert.match(next.stdout, /Brief evidence:/);
  assert.match(next.stdout, /Proxy evidence:/);
  assert.match(next.stdout, /Adapter evidence:/);

  const status = await runKlemm(["afk", "status", "--mission", "mission-afk-next"], { env });
  assert.match(status.stdout, /Helper: none/);
  assert.match(status.stdout, /Adapter events:/);
  assert.match(status.stdout, /Diffs:/);
  assert.match(status.stdout, /Debriefs:/);
});
