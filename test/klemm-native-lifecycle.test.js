import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 30000 } = {}) {
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

test("daemon ensure, repair, and health record native lifecycle evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-native-life-"));
  const pidFile = join(dataDir, "klemm.pid");
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(pidFile, "999999", "utf8");

  const ensure = await runKlemm(["daemon", "ensure", "--data-dir", dataDir, "--pid-file", pidFile, "--dry-run"], { env });
  assert.equal(ensure.status, 0, ensure.stderr);
  assert.match(ensure.stdout, /Klemm daemon ensure/);
  assert.match(ensure.stdout, /LaunchAgent: would_install|LaunchAgent: installed/);
  assert.match(ensure.stdout, /Health snapshot recorded/);

  const repair = await runKlemm(["daemon", "repair", "--data-dir", dataDir, "--pid-file", pidFile, "--dry-run"], { env });
  assert.equal(repair.status, 0, repair.stderr);
  assert.match(repair.stdout, /Klemm daemon repair/);
  assert.match(repair.stdout, /stale_pid=detected/);
  assert.match(repair.stdout, /Log rotation: bounded/);

  const health = await runKlemm(["daemon", "health", "--data-dir", dataDir, "--pid-file", pidFile, "--offline"], { env });
  assert.equal(health.status, 0, health.stderr);
  assert.match(health.stdout, /Daemon health: offline/);
  assert.match(health.stdout, /Native lifecycle: live/);

  const ultimate = await runKlemm(["ultimate", "evidence"], { env });
  assert.match(ultimate.stdout, /native_macos_presence: live/);
  assert.match(ultimate.stdout, /daemon ensure\/repair\/health evidence/);
});

