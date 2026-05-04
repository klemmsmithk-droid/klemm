import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

import { createInitialKlemmState } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";

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

async function withDaemon(initialState, callback) {
  let state = initialState;
  const server = createServer((request, response) => {
    createKlemmHttpServer({
      getState: () => state,
      saveState: (next) => {
        state = next;
      },
    }).emit("request", request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await callback({
      url: `http://127.0.0.1:${server.address().port}`,
      getState: () => state,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("daemon-first CLI commands label daemon transport and fall back locally", async () => {
  await withDaemon(createInitialKlemmState(), async ({ url, getState }) => {
    const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-first-"));
    const env = { KLEMM_DATA_DIR: dataDir, KLEMM_DAEMON_URL: url };

    const mission = await runKlemm(["mission", "start", "--id", "mission-daemon-first", "--goal", "Daemon first operator loop"], { env });
    assert.equal(mission.status, 0, mission.stderr);
    assert.match(mission.stdout, /Transport: daemon/);
    assert.equal(getState().missions[0].id, "mission-daemon-first");

    const queued = await runKlemm(["propose", "--id", "decision-daemon", "--mission", "mission-daemon-first", "--actor", "Codex", "--type", "git_push", "--target", "origin main", "--external", "publishes_code"], { env });
    assert.equal(queued.status, 0, queued.stderr);
    assert.match(queued.stdout, /Transport: daemon/);
    assert.equal(getState().queue[0].id, "decision-daemon");

    const approved = await runKlemm(["queue", "approve", "decision-daemon", "approved through daemon"], { env });
    assert.equal(approved.status, 0, approved.stderr);
    assert.match(approved.stdout, /Transport: daemon/);
    assert.equal(getState().queue[0].status, "approved");

    const debrief = await runKlemm(["debrief", "--mission", "mission-daemon-first"], { env });
    assert.equal(debrief.status, 0, debrief.stderr);
    assert.match(debrief.stdout, /Transport: daemon/);
    assert.match(debrief.stdout, /mission-daemon-first/);
  });

  const fallbackDir = await mkdtemp(join(tmpdir(), "klemm-daemon-fallback-"));
  const fallback = await runKlemm(["mission", "start", "--id", "mission-local-fallback", "--goal", "Fallback when daemon is gone"], {
    env: { KLEMM_DATA_DIR: fallbackDir, KLEMM_DAEMON_URL: "http://127.0.0.1:1" },
  });
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.match(fallback.stdout, /Transport: local fallback/);
});

test("wrapped Codex sessions orient the user and can finish the mission automatically", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-wrap-alpha-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const wrapped = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-wrap-alpha",
    "--goal",
    "Private alpha wrapped session",
    "--plan",
    "Run a supervised safe command and finish.",
    "--finish",
    "--",
    "node",
    "-e",
    "console.log('wrapped-alpha-ok')",
  ], { env });

  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.match(wrapped.stdout, /Klemm is watching/);
  assert.match(wrapped.stdout, /Data dir:/);
  assert.match(wrapped.stdout, /Watching: commands, tool output, diffs, queue, alignment/);
  assert.match(wrapped.stdout, /Stop: Ctrl-C/);
  assert.match(wrapped.stdout, /wrapped-alpha-ok/);
  assert.match(wrapped.stdout, /Mission finished: mission-wrap-alpha/);

  const current = await runKlemm(["mission", "current"], { env });
  assert.match(current.stdout, /No active mission/);
});

test("dogfood status and TUI show the active operator loop next actions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-dogfood-console-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-console", "--goal", "Operate Klemm dogfood loop"], { env });
  await runKlemm(["propose", "--id", "decision-console", "--mission", "mission-console", "--actor", "Codex", "--type", "git_push", "--target", "origin main", "--external", "publishes_code"], { env });

  const dogfood = await runKlemm(["dogfood", "status", "--mission", "mission-console"], { env });
  assert.equal(dogfood.status, 0, dogfood.stderr);
  assert.match(dogfood.stdout, /Klemm dogfood status/);
  assert.match(dogfood.stdout, /Next actions:/);
  assert.match(dogfood.stdout, /klemm queue inspect decision-console/);
  assert.match(dogfood.stdout, /klemm mission finish mission-console/);

  const tui = await runKlemm(["tui", "--mission", "mission-console"], { env });
  assert.equal(tui.status, 0, tui.stderr);
  assert.match(tui.stdout, /Next actions/);
  assert.match(tui.stdout, /klemm debrief --mission mission-console/);
  assert.match(tui.stdout, /klemm queue approve\|deny\|rewrite decision-console/);
});

test("memory-backed decisions show source evidence without trusting raw imports", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-memory-evidence-"));
  const exportPath = join(dataDir, "chatgpt.json");
  await writeFile(exportPath, JSON.stringify([{ role: "user", content: "Never let agents deploy production without approval." }]), "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["mission", "start", "--id", "mission-memory-evidence", "--goal", "Use reviewed memory evidence"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--file", exportPath], { env });
  const review = await runKlemm(["memory", "review", "--group-by-source"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];
  await runKlemm(["memory", "approve", memoryId, "trusted deployment boundary"], { env });
  await runKlemm(["memory", "promote-policy", memoryId, "--action-types", "deployment", "--target-includes", "production,prod"], { env });
  await runKlemm(["propose", "--id", "decision-memory-evidence", "--mission", "mission-memory-evidence", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment"], { env });

  const detail = await runKlemm(["queue", "inspect", "decision-memory-evidence"], { env });
  assert.equal(detail.status, 0, detail.stderr);
  assert.match(detail.stdout, /Source evidence:/);
  assert.match(detail.stdout, new RegExp(memoryId));
  assert.match(detail.stdout, /chatgpt/);
  assert.match(detail.stdout, /chatgpt\.json/);

  const model = await runKlemm(["user", "model"], { env });
  assert.match(model.stdout, /Authority boundaries/);
  assert.match(model.stdout, /Never let agents deploy production/);
});

test("captured output, adapter envelopes, and queue details redact secrets and doctor warns on unsafe permissions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-hardening-alpha-"));
  await chmod(dataDir, 0o777);
  await mkdir(join(dataDir, "logs"), { recursive: true });
  await writeFile(join(dataDir, "logs", "klemm-daemon.log"), "token=sk-live-1234567890\n", "utf8");
  const secretScript = join(dataDir, "print-output.js");
  await writeFile(secretScript, "console.log('token=sk-live-1234567890'); console.error('api_key=secret-value-123');", "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-redaction", "--goal", "Redact secrets"], { env });

  const captured = await runKlemm(["supervise", "--mission", "mission-redaction", "--capture", "--", "node", secretScript], { env });
  assert.equal(captured.status, 0, captured.stderr);

  const runs = await runKlemm(["supervised-runs", "--details"], { env });
  assert.doesNotMatch(runs.stdout, /sk-live-1234567890/);
  assert.doesNotMatch(runs.stdout, /secret-value-123/);
  assert.match(runs.stdout, /\[REDACTED\]/);

  await runKlemm(["adapter", "token", "add", "--id", "codex-local", "--token", "adapter-secret-token", "--versions", "1,2"], { env });
  const report = await runKlemm(["codex", "report", "--mission", "mission-redaction", "--adapter-client", "codex-local", "--adapter-token", "adapter-secret-token", "--protocol-version", "2", "--type", "tool_call", "--tool", "shell", "--command", "echo token=sk-live-1234567890"], { env });
  assert.equal(report.status, 0, report.stderr);
  const debrief = await runKlemm(["debrief", "--mission", "mission-redaction"], { env });
  assert.doesNotMatch(debrief.stdout, /sk-live-1234567890/);
  assert.match(debrief.stdout, /\[REDACTED\]/);

  const doctor = await runKlemm(["doctor", "--data-dir", dataDir, "--skip-health"], { env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Permissions: warning/);
});
