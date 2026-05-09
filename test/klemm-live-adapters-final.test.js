import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
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

test("live adapter proof requires real observed envelopes and labels fake proof as fixture", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-live-adapter-final-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(home, { recursive: true });

  await runKlemm(["mission", "start", "--id", "mission-live-adapter", "--hub", "codex", "--goal", "Prove live adapter evidence"], { env });
  await runKlemm(["adapters", "dogfood", "--suite", "95", "--fake-home", home, "--mission", "mission-live-adapter", "--goal", "goal-live-adapter"], { env });

  const fakeStatus = await runKlemm(["adapters", "status", "--live", "--mission", "mission-live-adapter"], { env });
  assert.match(fakeStatus.stdout, /Truth labels: live means observed activity/);
  assert.match(fakeStatus.stdout, /fixture proof ignored for ultimate score/);

  for (const [type, summary] of [
    ["session_start", "Codex live session started"],
    ["plan", "Codex live plan reported"],
    ["tool_call", "Codex live tool call"],
    ["file_change", "Codex live diff reported"],
    ["debrief", "Codex live debrief reported"],
    ["session_finish", "Codex live session finished"],
  ]) {
    await runKlemm(["codex", "report", "--mission", "mission-live-adapter", "--type", type, "--summary", summary, "--file", "src/klemm-cli.js"], { env });
  }

  const proof = await runKlemm(["adapters", "prove", "--live", "codex", "--mission", "mission-live-adapter"], { env });
  assert.equal(proof.status, 0, proof.stderr);
  assert.match(proof.stdout, /Adapter live proof: codex/);
  assert.match(proof.stdout, /lifecycle=present/);
  assert.match(proof.stdout, /Ultimate evidence: live/);

  const evidence = await runKlemm(["ultimate", "evidence", "--mission", "mission-live-adapter"], { env });
  assert.match(evidence.stdout, /codex: live/);
  assert.match(evidence.stdout, /adapter_battle_fixture: fixture ignored/);
});

