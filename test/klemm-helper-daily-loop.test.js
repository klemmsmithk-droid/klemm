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

test("helper follow shows live heartbeat, unmanaged-agent nudges, and stale warnings", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-helper-daily-"));
  const psFile = join(dataDir, "ps.txt");
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(psFile, "101 Codex codex --ask-for-approval on-request\n202 Cursor cursor-agent run\n303 node shell-agent.js\n", "utf8");

  const follow = await runKlemm(["helper", "follow", "--mission", "mission-helper-90", "--process-file", psFile, "--frontmost-app", "Codex", "--watch-path", "src"], { env });
  assert.equal(follow.status, 0, follow.stderr);
  assert.match(follow.stdout, /Klemm helper follow/);
  assert.match(follow.stdout, /Heartbeat: live/);
  assert.match(follow.stdout, /codex unmanaged session detected/);
  assert.match(follow.stdout, /cursor unmanaged session detected/);
  assert.match(follow.stdout, /Wrap with: klemm run codex/);

  const status = await runKlemm(["helper", "stream", "status", "--mission", "mission-helper-90", "--stale-after-ms", "0"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /health=stale/);
  assert.match(status.stdout, /Recommendation: restart helper stream or check helper permissions/);
  assert.match(status.stdout, /Watch paths: src/);
});
