import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createInitialKlemmState, recordOsObservation, startCodexHub } from "../src/klemm.js";
import { buildOsObservation, parseProcessTable } from "../src/klemm-os.js";

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

test("process table parsing keeps pid, app name, and full command", () => {
  const rows = parseProcessTable(`
PID COMM COMMAND
101 Codex /Applications/Codex.app/Contents/MacOS/Codex --session abc
202 claude claude --dangerously-skip-permissions
303 zsh /bin/zsh
`);

  assert.deepEqual(rows, [
    {
      pid: 101,
      name: "Codex",
      command: "/Applications/Codex.app/Contents/MacOS/Codex --session abc",
    },
    {
      pid: 202,
      name: "claude",
      command: "claude --dangerously-skip-permissions",
    },
    {
      pid: 303,
      name: "zsh",
      command: "/bin/zsh",
    },
  ]);
});

test("OS observation detects unmanaged agent-like processes and persists an alert", () => {
  const now = "2026-05-03T12:00:00.000Z";
  const state = startCodexHub(createInitialKlemmState({ now }), {
    id: "mission-os",
    goal: "Observe local agent activity while Kyle is AFK.",
    now,
  });
  const observation = buildOsObservation({
    id: "os-observation-001",
    missionId: "mission-os",
    processes: [
      { pid: 101, name: "codex", command: "codex --ask-for-approval on-request" },
      { pid: 202, name: "claude", command: "claude --dangerously-skip-permissions" },
      { pid: 303, name: "zsh", command: "/bin/zsh" },
    ],
    supervisedCommands: state.agents.map((agent) => agent.command),
    permissions: {
      accessibility: "unknown",
      screenRecording: "unknown",
      fileEvents: "available",
    },
    fileEvents: [{ path: "src/klemm.js", event: "modified" }],
    now,
  });

  const next = recordOsObservation(state, observation);

  assert.equal(next.osObservations[0].id, "os-observation-001");
  assert.deepEqual(next.osObservations[0].unmanagedAgents, [
    {
      pid: 202,
      name: "claude",
      command: "claude --dangerously-skip-permissions",
      reason: "agent-like process is running outside Klemm supervision",
    },
  ]);
  assert.equal(next.osObservations[0].permissions.fileEvents, "available");
  assert.equal(next.agentEvents[0].type, "os_observation_alert");
  assert.match(next.agentEvents[0].summary, /1 unmanaged agent-like process/);
});

test("klemm os snapshot records a real observation from injected fixtures", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-os-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const processFile = join(dataDir, "ps.txt");
  const watchedDir = join(dataDir, "watched");
  const watchedFile = join(watchedDir, "artifact.txt");
  await mkdir(watchedDir);
  await writeFile(watchedFile, "hello", "utf8");
  await writeFile(
    processFile,
    `
PID COMM COMMAND
101 codex codex --ask-for-approval on-request
202 claude claude --dangerously-skip-permissions
`,
    "utf8",
  );

  const hub = await runKlemm(["codex", "hub", "--id", "mission-os", "--goal", "Observe OS activity"], { env });
  assert.equal(hub.status, 0, hub.stderr);

  const snapshot = await runKlemm(
    [
      "os",
      "snapshot",
      "--mission",
      "mission-os",
      "--process-file",
      processFile,
      "--watch-path",
      watchedDir,
      "--frontmost-app",
      "Terminal",
    ],
    { env },
  );
  assert.equal(snapshot.status, 0, snapshot.stderr);
  assert.match(snapshot.stdout, /OS observation recorded: os-observation-/);
  assert.match(snapshot.stdout, /Processes: 2/);
  assert.match(snapshot.stdout, /Unmanaged agents: 1/);
  assert.match(snapshot.stdout, /File events: 1/);
  assert.match(snapshot.stdout, /Frontmost app: Terminal/);
  assert.match(snapshot.stdout, /claude --dangerously-skip-permissions/);

  const status = await runKlemm(["os", "status", "--mission", "mission-os"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /OS observations/);
  assert.match(status.stdout, /unmanaged=1/);
  assert.match(status.stdout, /files=1/);
});
