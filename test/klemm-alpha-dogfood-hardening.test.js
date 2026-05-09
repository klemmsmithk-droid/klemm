import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 10000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
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
    child.stdin.end(input);
  });
}

test("saved-me reports and dogfood export summarize real alpha evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-alpha-dogfood-"));
  const exportPath = join(dataDir, "dogfood-export.json");
  const env = { KLEMM_DATA_DIR: dataDir };

  const mission = await runKlemm(["mission", "start", "--id", "mission-alpha-dogfood", "--goal", "Dogfood Klemm on safe local work"], { env });
  assert.equal(mission.status, 0, mission.stderr);

  await runKlemm(["codex", "report", "--mission", "mission-alpha-dogfood", "--type", "plan", "--summary", "Codex will run safe local tests"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-alpha-dogfood", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-alpha-dogfood", "--type", "file_change", "--summary", "Updated test coverage", "--target", "test/klemm-alpha-dogfood-hardening.test.js"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-alpha-dogfood", "--type", "debrief", "--summary", "Dogfood evidence recorded"], { env });

  const risky = await runKlemm([
    "propose",
    "--id",
    "decision-alpha-push",
    "--mission",
    "mission-alpha-dogfood",
    "--actor",
    "Codex",
    "--type",
    "git_push",
    "--target",
    "git push origin main",
    "--external",
    "publishes_code",
  ], { env });
  assert.equal(risky.status, 0, risky.stderr);

  const savedList = await runKlemm(["saved", "list", "--mission", "mission-alpha-dogfood"], { env });
  assert.equal(savedList.status, 0, savedList.stderr);
  assert.match(savedList.stdout, /Klemm saved-me moments/);
  assert.match(savedList.stdout, /saved-decision-alpha-push/);
  assert.match(savedList.stdout, /blocked_push/);

  const savedReport = await runKlemm(["saved", "report", "saved-decision-alpha-push"], { env });
  assert.equal(savedReport.status, 0, savedReport.stderr);
  assert.match(savedReport.stdout, /Klemm saved-me report/);
  assert.match(savedReport.stdout, /What was attempted:/);
  assert.match(savedReport.stdout, /Why it was risky:/);
  assert.match(savedReport.stdout, /klemm trust report decision-alpha-push --audit/);

  const brief = await runKlemm(["trust", "report", "decision-alpha-push", "--brief"], { env });
  assert.equal(brief.status, 0, brief.stderr);
  assert.match(brief.stdout, /More detail: klemm trust report decision-alpha-push --audit/);
  assert.match(brief.stdout, /Risk class:/);

  const audit = await runKlemm(["trust", "report", "decision-alpha-push", "--audit"], { env });
  assert.equal(audit.status, 0, audit.stderr);
  assert.match(audit.stdout, /Audit detail:/);
  assert.match(audit.stdout, /saved-me candidate: saved-decision-alpha-push/);

  const exported = await runKlemm(["dogfood", "export", "--mission", "mission-alpha-dogfood", "--output", exportPath], { env });
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(exported.stdout, /Dogfood export written:/);
  assert.match(exported.stdout, /Saved-me moments: 1/);

  const packet = JSON.parse(await readFile(exportPath, "utf8"));
  assert.equal(packet.mission.id, "mission-alpha-dogfood");
  assert.equal(packet.savedMoments.length, 1);
  assert.equal(packet.klemmActuallyHelped, true);
  assert.ok(packet.evidence.decisions.some((decision) => decision.id === "decision-alpha-push"));
});

test("false positive and false negative corrections are reviewable, not authority by default", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-alpha-corrections-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["mission", "start", "--id", "mission-alpha-corrections", "--goal", "Exercise correction loop"], { env });
  await runKlemm([
    "propose",
    "--id",
    "decision-alpha-safe",
    "--mission",
    "mission-alpha-corrections",
    "--actor",
    "Shell",
    "--type",
    "command",
    "--target",
    "npm test",
  ], { env });
  await runKlemm([
    "propose",
    "--id",
    "decision-alpha-delete",
    "--mission",
    "mission-alpha-corrections",
    "--actor",
    "Shell",
    "--type",
    "destructive_command",
    "--target",
    "rm -rf build",
  ], { env });

  const falseNegative = await runKlemm(["corrections", "mark-false-negative", "decision-alpha-safe", "--preference", "This kind of command should have queued in this mission."], { env });
  assert.equal(falseNegative.status, 0, falseNegative.stderr);
  assert.match(falseNegative.stdout, /Correction recorded:/);
  assert.match(falseNegative.stdout, /Memory candidate: pending_review/);

  const falsePositive = await runKlemm(["corrections", "mark-false-positive", "decision-alpha-delete", "--preference", "This fixture delete was safe because it targeted disposable build output."], { env });
  assert.equal(falsePositive.status, 0, falsePositive.stderr);
  assert.match(falsePositive.stdout, /Correction recorded:/);

  const list = await runKlemm(["corrections", "list"], { env });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /false_negative/);
  assert.match(list.stdout, /false_positive/);
  assert.match(list.stdout, /pending_review/);
});
