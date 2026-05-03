import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createKlemmAdapterClient, validateAdapterEnvelope } from "../src/klemm-adapter-sdk.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 5000 } = {}) {
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

test("doctor repairs stale daemon pid files and reports store, logs, and health readiness", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-doctor-"));
  const pidFile = join(dataDir, "klemm.pid");
  const logFile = join(dataDir, "logs", "klemm-daemon.log");
  await mkdir(join(dataDir, "logs"), { recursive: true });
  await writeFile(pidFile, "999999999", "utf8");
  await writeFile(logFile, "Klemm daemon listening\n", "utf8");

  const doctor = await runKlemm(["doctor", "--pid-file", pidFile, "--log-file", logFile, "--repair", "--skip-health"], {
    env: { KLEMM_DATA_DIR: dataDir },
  });

  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Klemm doctor/);
  assert.match(doctor.stdout, /Store: ok/);
  assert.match(doctor.stdout, /Schema version:/);
  assert.match(doctor.stdout, /PID file: stale repaired/);
  assert.match(doctor.stdout, /Logs: ok/);
  assert.match(doctor.stdout, /Health: skipped/);
  await assert.rejects(access(pidFile));
});

test("context sync scheduler plans due sources and advances their next run window", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-sync-schedule-"));
  const exportPath = join(dataDir, "chatgpt.json");
  await writeFile(exportPath, JSON.stringify([{ role: "user", content: "I like scheduled context syncs for Klemm." }]), "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };

  const add = await runKlemm([
    "sync",
    "add",
    "--id",
    "chat-history",
    "--provider",
    "chatgpt",
    "--path",
    exportPath,
    "--interval-minutes",
    "30",
    "--now",
    "2026-05-03T12:00:00.000Z",
  ], { env });
  assert.equal(add.status, 0, add.stderr);

  const plan = await runKlemm(["sync", "plan", "--now", "2026-05-03T12:00:00.000Z"], { env });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /Due sources: 1/);
  assert.match(plan.stdout, /chat-history due/);

  const run = await runKlemm(["sync", "run", "--due", "--now", "2026-05-03T12:00:00.000Z"], { env });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Imported: 1/);
  assert.match(run.stdout, /Scheduled next: 1/);

  const laterPlan = await runKlemm(["sync", "plan", "--now", "2026-05-03T12:10:00.000Z"], { env });
  assert.equal(laterPlan.status, 0, laterPlan.stderr);
  assert.match(laterPlan.stdout, /Due sources: 0/);
  assert.match(laterPlan.stdout, /chat-history waiting next=2026-05-03T12:30:00.000Z/);
});

test("supervised runtime capture records process metadata and live intervention details", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-hardening-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-runtime-hardening", "--goal", "Catch production deploys", "--block", "deployment"], { env });

  const supervised = await runKlemm([
    "supervise",
    "--mission",
    "mission-runtime-hardening",
    "--capture",
    "--intercept-output",
    "--record-tree",
    "--timeout-ms",
    "2000",
    "--",
    "node",
    "-e",
    "console.log(Buffer.from('ZGVwbG95IHByb2R1Y3Rpb24gbm93','base64').toString()); setTimeout(()=>{}, 500)",
  ], { env, timeoutMs: 6000 });

  assert.equal(supervised.status, 2, supervised.stderr);
  assert.match(supervised.stdout, /Klemm live intervention:/);
  assert.match(supervised.stdout, /Capture ID:/);

  const runs = await runKlemm(["supervised-runs", "--details"], { env });
  assert.equal(runs.status, 0, runs.stderr);
  assert.match(runs.stdout, /interventions=1/);
  assert.match(runs.stdout, /pid=\d+/);
  assert.match(runs.stdout, /termination=SIGTERM/);
});

test("adapter SDK builds conformant protocol envelopes for embeddable agents", () => {
  const client = createKlemmAdapterClient({
    adapterClientId: "codex-local",
    adapterToken: "token-123",
    protocolVersion: 2,
    missionId: "mission-sdk",
    agentId: "agent-codex",
  });

  const envelope = client.toolCall({
    tool: "shell",
    command: "npm test",
    summary: "Run the full suite",
  });
  const validation = validateAdapterEnvelope(envelope);

  assert.equal(validation.ok, true);
  assert.equal(envelope.adapterClientId, "codex-local");
  assert.equal(envelope.protocolVersion, 2);
  assert.equal(envelope.event, "tool_call");
  assert.deepEqual(client.conformanceSamples().map((sample) => sample.event), ["plan", "tool_call", "diff", "uncertainty", "debrief"]);
});

test("trust console drilldown explains queued decisions with risk factors and policy evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-trust-console-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-trust", "--goal", "Review production changes", "--block", "deployment"], { env });
  await runKlemm(["policy", "add", "--id", "policy-prod", "--name", "Production deploy review", "--action-types", "deployment", "--target-includes", "prod"], { env });
  await runKlemm(["propose", "--id", "decision-prod", "--mission", "mission-trust", "--actor", "Codex", "--type", "deployment", "--target", "deploy prod", "--external", "deployment"], { env });

  const trust = await runKlemm(["tui", "--view", "trust", "--decision", "decision-prod", "--mission", "mission-trust"], { env });

  assert.equal(trust.status, 0, trust.stderr);
  assert.match(trust.stdout, /Decision Detail/);
  assert.match(trust.stdout, /decision-prod queue/);
  assert.match(trust.stdout, /Risk factors:/);
  assert.match(trust.stdout, /Matched policies:/);
  assert.match(trust.stdout, /policy-prod/);
  assert.match(trust.stdout, /Explanation:/);
});
