import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

test("trust why autopilot explains next prompt evidence and correction path", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-afk-trust-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["memory", "seed-proxy", "--id", "memory-trust-proceed", "--text", "Kyle uses proceed to keep safe local implementation moving."], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-trust-no-corners", "--text", "No corners cut means focused tests, full tests, and debrief."], { env });

  const started = await runKlemm([
    "afk",
    "start",
    "--id",
    "mission-afk-trust",
    "--goal",
    "Explain AFK continuation",
    "--agent",
    "codex",
    "--",
    "node",
    "-e",
    "console.log('trust proof')",
  ], { env });
  const tickId = started.stdout.match(/Autopilot tick: (autopilot-tick-[^\s]+)/)?.[1];
  assert.ok(tickId, started.stdout);

  const why = await runKlemm(["trust", "why", "--autopilot", tickId], { env });
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /Why Klemm continued for Kyle/);
  assert.match(why.stdout, /Bottom line: continue/);
  assert.match(why.stdout, /Exact next prompt:/);
  assert.match(why.stdout, /Proceed toward/);
  assert.match(why.stdout, /Active goal:/);
  assert.match(why.stdout, /Brief check: aligned/);
  assert.match(why.stdout, /Proxy confidence: high/);
  assert.match(why.stdout, /memory-trust-proceed|memory-trust-no-corners/);
  assert.match(why.stdout, /What would change this:/);
  assert.match(why.stdout, new RegExp(`klemm corrections add --autopilot ${tickId}`));
});
