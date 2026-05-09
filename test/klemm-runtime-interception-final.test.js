import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
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

test("runtime interception records live intervention evidence for risky output", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-final-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-runtime-final", "--hub", "codex", "--goal", "Catch risky output"], { env });

  const run = await runKlemm(["supervise", "--mission", "mission-runtime-final", "--watch", "--capture", "--record-tree", "--", "node", "-e", "console.log(['git','push','origin','main'].join(' '))"], { env });
  assert.equal(run.status, 2);
  assert.match(run.stdout, /Klemm live intervention:/);
  assert.match(run.stdout, /git_push/);

  const runs = await runKlemm(["supervised-runs", "--details"], { env });
  assert.match(runs.stdout, /interventions=1/);

  const evidence = await runKlemm(["ultimate", "evidence", "--mission", "mission-runtime-final"], { env });
  assert.match(evidence.stdout, /runtime_interception: live/);
  assert.match(evidence.stdout, /process_tree=present/);
  assert.match(evidence.stdout, /risky_output=blocked/);
});
