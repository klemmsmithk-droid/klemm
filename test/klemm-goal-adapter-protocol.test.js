import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

import { createInitialKlemmState } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";
import { executeKlemmTool, KLEMM_MCP_TOOLS } from "../src/klemm-tools.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 10000 } = {}) {
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

test("Goal Adapter Protocol v1 exposes lifecycle tools and auto-attaches adapter envelopes", () => {
  const toolNames = KLEMM_MCP_TOOLS.map((tool) => tool.name);
  for (const name of ["goal_start", "goal_attach", "goal_tick", "goal_status", "goal_complete", "goal_debrief"]) {
    assert.ok(toolNames.includes(name), `${name} should be an MCP tool`);
  }

  let state = createInitialKlemmState({ now: "2026-05-04T12:00:00.000Z" });
  let output = executeKlemmTool("goal_start", {
    id: "goal-adapter-v1",
    text: "Have Claude fix the parser regression",
    success: "focused tests pass",
    watchPaths: ["src", "test"],
    now: "2026-05-04T12:00:00.000Z",
  }, { state });
  state = output.state;
  assert.equal(output.result.goal.id, "goal-adapter-v1");
  assert.equal(output.result.mission.id, "mission-goal-adapter-v1");

  output = executeKlemmTool("record_adapter_envelope", {
    goalId: "goal-adapter-v1",
    agentId: "agent-claude-parser",
    type: "tool_call",
    summary: "Ran parser tests",
    tool: "shell",
    command: "npm test -- parser",
    fileChanges: ["test/parser.test.js"],
    evidence: "focused tests passed",
    now: "2026-05-04T12:01:00.000Z",
  }, { state });
  state = output.state;

  assert.equal(output.result.accepted, true);
  assert.equal(output.result.goalTick.goalId, "goal-adapter-v1");
  assert.equal(output.result.goalTick.alignment, "on_track");
  assert.equal(output.result.activity.missionId, "mission-goal-adapter-v1");
  assert.equal(state.goals[0].attachedAgents[0].agentId, "agent-claude-parser");
  assert.equal(state.goals[0].ticks.length, 1);

  output = executeKlemmTool("goal_status", { id: "goal-adapter-v1" }, { state });
  assert.equal(output.result.goal.latestAlignment, "on_track");
  assert.equal(output.result.activities.length, 1);

  output = executeKlemmTool("goal_complete", {
    id: "goal-adapter-v1",
    evidence: "parser suite passed",
    now: "2026-05-04T12:02:00.000Z",
  }, { state });
  state = output.state;
  assert.equal(output.result.goal.status, "completed");

  output = executeKlemmTool("goal_debrief", { id: "goal-adapter-v1" }, { state });
  assert.match(output.result.debrief, /Klemm goal debrief/);
  assert.match(output.result.debrief, /parser suite passed/);
});

test("daemon exposes HTTP goal endpoints and adapter envelopes can report into a goal", async () => {
  let state = createInitialKlemmState({ now: "2026-05-04T12:00:00.000Z" });
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const started = await requestJson(port, "/api/goals/start", {
      id: "goal-http",
      text: "Keep a browser agent on research task",
      success: "sources collected",
      watchPaths: ["docs"],
    });
    assert.equal(started.goal.id, "goal-http");

    const envelope = await requestJson(port, "/api/adapter/envelope", {
      goalId: "goal-http",
      agentId: "agent-browser-research",
      type: "diff",
      summary: "Added research notes",
      fileChanges: ["docs/research.md"],
    });
    assert.equal(envelope.goalTick.alignment, "on_track");

    const status = await getJson(port, "/api/goals/status?id=goal-http");
    assert.equal(status.goal.ticks.length, 1);
    assert.equal(status.activities.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("goals TUI and goal trust why explain alignment against a durable goal", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-goal-adapter-cli-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["goal", "start", "--id", "goal-cli", "--text", "Keep shell agents focused on tests", "--success", "npm test passes", "--watch-path", "test"], { env });
  await runKlemm(["goal", "attach", "--id", "goal-cli", "--agent", "agent-shell-cli", "--kind", "shell_agent", "--command", "node"], { env });
  await runKlemm(["goal", "tick", "--id", "goal-cli", "--agent", "agent-shell-cli", "--summary", "Agent tried to deploy production", "--changed-file", "scripts/deploy.js"], { env });

  const tui = await runKlemm(["tui", "--view", "goals"], { env });
  assert.equal(tui.status, 0, tui.stderr);
  assert.match(tui.stdout, /Klemm Goals/);
  assert.match(tui.stdout, /goal-cli/);
  assert.match(tui.stdout, /needs_review/);
  assert.match(tui.stdout, /changed file outside goal watch paths/);

  const why = await runKlemm(["trust", "why", "--goal", "goal-cli"], { env });
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /Why Klemm judged goal/);
  assert.match(why.stdout, /Bottom line: needs_review/);
  assert.match(why.stdout, /Agent tried to deploy production/);
  assert.match(why.stdout, /changed file outside goal watch paths/);
});

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  assert.equal(response.status, 200);
  return response.json();
}

async function requestJson(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}
