import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createInitialKlemmState,
  evaluateAgentAlignment,
  recordAgentActivity,
  startMission,
} from "../src/klemm.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("alignment monitor marks repeated failures as stuck and records a pause intervention", () => {
  const now = "2026-05-03T12:00:00.000Z";
  let state = startMission(createInitialKlemmState({ now }), {
    id: "mission-monitor",
    goal: "Implement the QuickBooks connector.",
    now,
  });

  for (let index = 0; index < 3; index += 1) {
    state = recordAgentActivity(state, {
      missionId: "mission-monitor",
      agentId: "agent-codex",
      type: "command",
      summary: "npm test failed",
      target: "npm test",
      exitCode: 1,
      now: `2026-05-03T12:0${index}:00.000Z`,
    });
  }

  const evaluated = evaluateAgentAlignment(state, {
    missionId: "mission-monitor",
    agentId: "agent-codex",
    now: "2026-05-03T12:04:00.000Z",
  });

  assert.equal(evaluated.alignmentReports[0].state, "stuck");
  assert.match(evaluated.alignmentReports[0].reason, /3 recent failing command/);
  assert.equal(evaluated.agentInterventions[0].type, "pause");
  assert.equal(evaluated.agentInterventions[0].status, "active");
});

test("alignment monitor nudges scope drift when file activity no longer matches the mission", () => {
  const now = "2026-05-03T12:00:00.000Z";
  const state = recordAgentActivity(
    startMission(createInitialKlemmState({ now }), {
      id: "mission-monitor",
      goal: "Implement the QuickBooks connector.",
      now,
    }),
    {
      missionId: "mission-monitor",
      agentId: "agent-codex",
      type: "file_change",
      summary: "Edited marketing homepage copy",
      target: "src/marketing-homepage.js",
      fileChanges: ["src/marketing-homepage.js"],
      now,
    },
  );

  const evaluated = evaluateAgentAlignment(state, {
    missionId: "mission-monitor",
    agentId: "agent-codex",
    now: "2026-05-03T12:01:00.000Z",
  });

  assert.equal(evaluated.alignmentReports[0].state, "scope_drift");
  assert.equal(evaluated.agentInterventions[0].type, "nudge");
  assert.match(evaluated.agentInterventions[0].message, /QuickBooks connector/);
});

test("supervise --watch records activity, evaluates alignment, and surfaces the intervention", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-monitor-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const mission = await runKlemm(["mission", "start", "--id", "mission-watch", "--goal", "Run reliable tests"], { env });
  assert.equal(mission.status, 0, mission.stderr);

  const watched = await runKlemm(
    ["supervise", "--watch", "--mission", "mission-watch", "--", "node", "-e", "console.error('boom'); process.exit(1)"],
    { env },
  );
  assert.equal(watched.status, 1);
  assert.match(watched.stdout, /Klemm alignment: needs_nudge/);
  assert.match(watched.stdout, /Intervention: nudge/);

  const status = await runKlemm(["monitor", "status", "--mission", "mission-watch"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Agent monitor/);
  assert.match(status.stdout, /Activities: 1/);
  assert.match(status.stdout, /Latest alignment: needs_nudge/);
});
