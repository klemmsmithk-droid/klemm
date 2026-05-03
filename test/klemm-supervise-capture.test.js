import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("supervise capture stores transcript, exit code, duration, and file changes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-capture-data-"));
  const workDir = await mkdtemp(join(tmpdir(), "klemm-capture-work-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  assert.equal((await runKlemm(["mission", "start", "--id", "mission-capture", "--goal", "Capture process work"], { env })).status, 0);

  const result = await runKlemm(
    [
      "supervise",
      "--capture",
      "--mission",
      "mission-capture",
      "--cwd",
      workDir,
      "--",
      "node",
      "-e",
      "const fs=require('fs'); fs.writeFileSync('artifact.txt','captured'); console.log('hello capture'); console.error('warn capture')",
    ],
    { env },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /hello capture/);
  assert.match(result.stderr, /warn capture/);
  assert.match(result.stdout, /Capture ID: supervised-/);
  assert.equal(await readFile(join(workDir, "artifact.txt"), "utf8"), "captured");

  const status = await runKlemm(["supervised-runs"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Supervised runs/);
  assert.match(status.stdout, /exit=0/);
  assert.match(status.stdout, /artifact.txt/);
  assert.match(status.stdout, /stdout=hello capture/);
  assert.match(status.stdout, /stderr=warn capture/);
});
