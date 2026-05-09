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

test("directions, reviewed memory, and workbench build a user model without LLM account connectors", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-user-final-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["directions", "add", "--text", "When I say proceed, continue safe local implementation and run tests before debrief."], { env });
  await runKlemm(["context", "import", "--provider", "repo", "--source-ref", "local-repo", "--text", "Kyle wants pushes, deploys, OAuth changes, and external sends queued while AFK."], { env });
  await runKlemm(["memory", "scale", "approve", "--cluster", "authority_boundaries", "--limit", "1", "--promote-policy"], { env });

  const list = await runKlemm(["directions", "list"], { env });
  assert.match(list.stdout, /Klemm directions/);
  assert.match(list.stdout, /proceed, continue safe local implementation/);

  const profile = await runKlemm(["user", "profile", "--card", "--evidence"], { env });
  assert.match(profile.stdout, /Kyle Profile Card/);
  assert.match(profile.stdout, /Explicit directions/);
  assert.match(profile.stdout, /Source evidence/);
  assert.doesNotMatch(profile.stdout, /ChatGPT OAuth/);

  const workbench = await runKlemm(["memory", "workbench", "--source-preview", "--why-trusted"], { env });
  assert.match(workbench.stdout, /Memory Workbench/);
  assert.match(workbench.stdout, /Grouped inbox/);
  assert.match(workbench.stdout, /Why trusted/);
  assert.match(workbench.stdout, /Revoke:/);
});

