import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("klemm run prepares a named Codex runtime profile without launching in dry-run mode", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const mission = await runKlemm(["mission", "start", "--id", "mission-runtime", "--hub", "codex", "--goal", "Dogfood runtime wrapper"], {
    env,
  });
  assert.equal(mission.status, 0, mission.stderr);

  const result = await runKlemm(["run", "codex", "--mission", "mission-runtime", "--dry-run", "--", "--ask-for-approval", "on-request"], {
    env,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Agent runtime profile: codex/);
  assert.match(result.stdout, /Agent registered: agent-runtime-codex/);
  assert.match(result.stdout, /Command: codex --ask-for-approval on-request/);
  assert.match(result.stdout, /Dry run: launch skipped/);

  const agents = await runKlemm(["agents"], { env });
  assert.match(agents.stdout, /agent-runtime-codex active mission=mission-runtime kind=codex_agent/);
});

test("klemm run without a profile gives a friendly next step instead of a hard usage error", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-help-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const result = await runKlemm(["run"], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Klemm run/);
  assert.match(result.stdout, /Most users start with: klemm start/);
  assert.match(result.stdout, /Run Codex through Klemm: klemm run codex/);
  assert.doesNotMatch(result.stderr, /Usage:/);
});

test("klemm run codex can use the default Codex command without a trailing separator", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-no-separator-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["mission", "start", "--id", "mission-runtime-no-separator", "--hub", "codex", "--goal", "Dogfood runtime wrapper"], {
    env,
  });

  const result = await runKlemm(["run", "codex", "--mission", "mission-runtime-no-separator", "--dry-run"], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Agent runtime profile: codex/);
  assert.match(result.stdout, /Command: codex/);
  assert.match(result.stdout, /Dry run: launch skipped/);
});

test("klemm run intercepts high-risk profile commands before launch", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["mission", "start", "--id", "mission-runtime", "--hub", "terminal", "--goal", "Intercept risky agent commands"], {
    env,
  });

  const blocked = await runKlemm(["run", "shell", "--mission", "mission-runtime", "--dry-run", "--", "git", "push", "origin", "main"], {
    env,
  });

  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /Klemm blocked runtime before launch/);
  assert.match(blocked.stdout, /Decision: queue/);
  assert.match(blocked.stdout, /git_push/);
});
