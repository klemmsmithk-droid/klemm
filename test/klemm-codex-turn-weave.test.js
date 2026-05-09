import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

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

test("codex wrapper injects turn commands and records turn start finish coverage", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-turn-weave-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const wrapped = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-turn-weave",
    "--goal",
    "Autonomously weave Klemm through Codex turns",
    "--plan",
    "Run focused tests and debrief.",
    "--dry-run",
  ], { env });

  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.match(wrapped.stdout, /Turn start: KLEMM_CODEX_TURN_START_COMMAND=/);
  assert.match(wrapped.stdout, /Turn check: KLEMM_CODEX_TURN_CHECK_COMMAND=/);
  assert.match(wrapped.stdout, /Turn finish: KLEMM_CODEX_TURN_FINISH_COMMAND=/);
  assert.match(wrapped.stdout, /Turn start reported: accepted/);
  assert.match(wrapped.stdout, /Turn finish reported: accepted/);

  const check = await runKlemm([
    "codex",
    "turn",
    "check",
    "--mission",
    "mission-turn-weave",
    "--agent",
    "agent-codex",
    "--summary",
    "Before next tool call, verify the plan is still local.",
    "--plan",
    "Run focused tests and debrief the result.",
  ], { env });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Codex turn check recorded/);
  assert.match(check.stdout, /Brief check: aligned/);

  const status = await runKlemm(["codex", "turn", "status", "--mission", "mission-turn-weave"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Codex turn weave status/);
  assert.match(status.stdout, /turn_starts=1/);
  assert.match(status.stdout, /turn_checks=1/);
  assert.match(status.stdout, /turn_finishes=1/);
  assert.match(status.stdout, /brief_checks=2/);

  const contract = await runKlemm(["codex", "contract", "status", "--mission", "mission-turn-weave"], { env });
  assert.match(contract.stdout, /turn_coverage=yes/);
});

test("installed /klemm skill tells Codex to call Klemm at every turn boundary", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-turn-skill-"));
  const installDir = join(dataDir, "codex-install");
  const env = { KLEMM_DATA_DIR: dataDir };

  const installed = await runKlemm(["codex", "install", "--output-dir", installDir, "--data-dir", dataDir], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const skill = await readFile(join(installDir, "skills", "klemm", "SKILL.md"), "utf8");

  assert.match(skill, /Every Codex turn/i);
  assert.match(skill, /KLEMM_CODEX_TURN_START_COMMAND/);
  assert.match(skill, /KLEMM_CODEX_TURN_CHECK_COMMAND/);
  assert.match(skill, /KLEMM_CODEX_TURN_FINISH_COMMAND/);
  assert.match(skill, /before the first tool call/i);
  assert.match(skill, /before asking Kyle/i);
});
