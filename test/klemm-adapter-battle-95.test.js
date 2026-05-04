import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 15000 } = {}) {
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

test("adapter suite 95 dogfoods Codex, Claude, Cursor, shell, MCP, and browser agents", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-95-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });

  const dogfood = await runKlemm([
    "adapters",
    "dogfood",
    "--suite",
    "95",
    "--fake-home",
    home,
    "--mission",
    "mission-adapter-95",
    "--goal",
    "goal-adapter-95",
  ], { env });
  assert.equal(dogfood.status, 0, dogfood.stderr);
  assert.match(dogfood.stdout, /Adapter Battle Suite 95/);
  for (const adapter of ["codex", "claude", "cursor", "shell", "mcp", "browser"]) {
    assert.match(dogfood.stdout, new RegExp(`${adapter}: 8/8 strong`));
  }
  assert.match(dogfood.stdout, /risky-action queue: proven/);
  assert.match(dogfood.stdout, /final debrief: proven/);

  const compliance = await runKlemm(["adapters", "compliance", "--mission", "mission-adapter-95", "--require", "codex,claude,cursor,shell,mcp,browser"], { env });
  assert.equal(compliance.status, 0, compliance.stderr);
  for (const adapter of ["codex", "claude", "cursor", "shell", "mcp", "browser"]) {
    assert.match(compliance.stdout, new RegExp(`${adapter}: 8/8 strong`));
  }
});
