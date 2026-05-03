import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createInitialKlemmState } from "../src/klemm.js";
import { executeKlemmTool, KLEMM_MCP_TOOLS } from "../src/klemm-tools.js";

test("Klemm MCP-style tools expose the cross-agent authority surface", () => {
  const toolNames = KLEMM_MCP_TOOLS.map((tool) => tool.name);

  assert.deepEqual(toolNames, [
    "register_agent",
    "start_mission",
    "propose_action",
    "request_authority",
    "record_outcome",
    "get_user_model_summary",
    "queue_user_decision",
    "record_agent_event",
    "start_codex_hub",
    "ingest_memory_export",
    "render_dashboard",
    "review_memory",
    "record_supervised_run",
    "codex_context",
    "record_os_observation",
    "get_os_status",
  ]);
});

test("Klemm tool dispatcher starts missions, decides authority, and records outcomes", () => {
  const initial = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const missionResult = executeKlemmTool("start_mission", {
    id: "mission-tool",
    hub: "codex",
    goal: "Supervise tool-compatible agents.",
    now: "2026-05-03T12:00:00.000Z",
  }, { state: initial });

  assert.equal(missionResult.result.mission.id, "mission-tool");

  const authorityResult = executeKlemmTool("request_authority", {
    id: "decision-send",
    missionId: "mission-tool",
    actor: "Email Agent",
    actionType: "external_send",
    target: "customer follow-up email",
    externality: "email_delivery",
    missionRelevance: "related",
    now: "2026-05-03T12:01:00.000Z",
  }, { state: missionResult.state });

  assert.equal(authorityResult.result.decision.decision, "queue");
  assert.equal(authorityResult.result.queueLength, 1);

  const outcomeResult = executeKlemmTool("record_outcome", {
    decisionId: "decision-send",
    outcome: "denied",
    note: "External sends need action-time approval.",
    now: "2026-05-03T12:02:00.000Z",
  }, { state: authorityResult.state });

  assert.equal(outcomeResult.result.queueItem.status, "denied");
});

test("Klemm tool dispatcher records OS observations for compatible agents", () => {
  const initial = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const missionResult = executeKlemmTool("start_codex_hub", {
    id: "mission-tool-os",
    goal: "Observe OS activity for compatible agents.",
    now: "2026-05-03T12:00:00.000Z",
  }, { state: initial });

  const observationResult = executeKlemmTool("record_os_observation", {
    id: "os-tool-001",
    missionId: "mission-tool-os",
    processes: [
      { pid: 101, name: "codex", command: "codex --ask-for-approval on-request" },
      { pid: 202, name: "claude", command: "claude --dangerously-skip-permissions" },
    ],
    supervisedCommands: ["codex"],
    now: "2026-05-03T12:01:00.000Z",
  }, { state: missionResult.state });

  assert.equal(observationResult.result.osObservation.id, "os-tool-001");
  assert.equal(observationResult.result.osObservation.unmanagedAgents.length, 1);

  const statusResult = executeKlemmTool("get_os_status", {
    missionId: "mission-tool-os",
  }, { state: observationResult.state });

  assert.equal(statusResult.result.osObservations.length, 1);
});

test("Klemm Codex skill teaches Codex to register as hub and ask before risky actions", async () => {
  const skill = await readFile(".agents/skills/klemm/SKILL.md", "utf8");

  assert.match(skill, /\/klemm/);
  assert.match(skill, /register.*Codex.*hub/is);
  assert.match(skill, /request_authority/);
  assert.match(skill, /external sends/i);
  assert.match(skill, /debrief/i);
});
