import test from "node:test";
import assert from "node:assert/strict";

import { createInitialKlemmState } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";

test("Klemm daemon exposes local status, mission, authority, and debrief endpoints", async () => {
  let state = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const mission = await requestJson(port, "/api/mission/start", {
      id: "mission-daemon",
      hub: "codex",
      goal: "Supervise daemon-compatible agents.",
    });
    assert.equal(mission.mission.id, "mission-daemon");

    const authority = await requestJson(port, "/api/authority/request", {
      id: "decision-deploy",
      missionId: "mission-daemon",
      actor: "Deploy Agent",
      actionType: "external_send",
      target: "production deployment notification",
      externality: "public_status_page",
      missionRelevance: "related",
    });
    assert.equal(authority.decision.decision, "queue");

    const status = await getJson(port, "/api/status");
    assert.equal(status.queuedCount, 1);

    const debrief = await getJson(port, "/api/debrief?mission=mission-daemon");
    assert.match(debrief.debrief, /Supervise daemon-compatible agents/);
    assert.match(debrief.debrief, /Queued: 1/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Klemm daemon exposes Codex hub, event, memory-export, and dashboard endpoints", async () => {
  let state = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const hub = await requestJson(port, "/api/codex/hub", {
      id: "mission-api-codex",
      goal: "API Codex hub",
    });
    assert.equal(hub.mission.id, "mission-api-codex");
    assert.equal(hub.agent.id, "agent-codex");

    const event = await requestJson(port, "/api/events", {
      id: "event-api-push",
      missionId: "mission-api-codex",
      agentId: "agent-codex",
      type: "external_action_requested",
      summary: "Codex wants to push",
      action: {
        id: "decision-api-push",
        actionType: "git_push",
        target: "origin main",
        externality: "publishes_code",
        missionRelevance: "related",
      },
    });
    assert.equal(event.decision.decision, "queue");

    const memory = await requestJson(port, "/api/memory/ingest-export", {
      source: "chatgpt_export",
      text: JSON.stringify([{ role: "user", content: "I prefer terminal-first tools." }]),
    });
    assert.equal(memory.import.messageCount, 1);

    const dashboard = await getJson(port, "/api/dashboard?mission=mission-api-codex");
    assert.match(dashboard.dashboard, /API Codex hub/);
    assert.match(dashboard.dashboard, /Queue: 1 unresolved/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Klemm daemon exposes Codex context, memory review, and supervised-run capture endpoints", async () => {
  let state = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await requestJson(port, "/api/codex/hub", { id: "mission-api-capture", goal: "API capture" });
    const memory = await requestJson(port, "/api/memory/ingest-export", {
      source: "codex_export",
      text: JSON.stringify([{ role: "user", content: "I prefer terminal-first tools." }]),
    });
    const memoryId = memory.memories[0].id;

    const reviewed = await requestJson(port, "/api/memory/review", {
      memoryId,
      status: "approved",
      note: "Trusted preference.",
    });
    assert.equal(reviewed.memory.status, "approved");

    const captured = await requestJson(port, "/api/supervised-runs", {
      missionId: "mission-api-capture",
      command: "node -e console.log('api')",
      exitCode: 0,
      stdout: "api",
      stderr: "",
      fileChanges: ["artifact.txt"],
    });
    assert.match(captured.supervisedRun.id, /supervised-/);

    const context = await getJson(port, "/api/codex/context?mission=mission-api-capture");
    assert.equal(context.mission.id, "mission-api-capture");
    assert.equal(context.trustedMemories[0].id, memoryId);
    assert.equal(context.supervisedRuns[0].fileChanges[0], "artifact.txt");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Klemm daemon exposes OS observation snapshot and status endpoints", async () => {
  let state = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await requestJson(port, "/api/codex/hub", { id: "mission-api-os", goal: "API OS observer" });
    const observation = await requestJson(port, "/api/os/observations", {
      id: "os-api-001",
      missionId: "mission-api-os",
      processes: [
        { pid: 101, name: "codex", command: "codex --ask-for-approval on-request" },
        { pid: 202, name: "claude", command: "claude --dangerously-skip-permissions" },
      ],
      supervisedCommands: ["codex"],
      permissions: {
        accessibility: "unknown",
        screenRecording: "unknown",
        fileEvents: "available",
      },
    });

    assert.equal(observation.osObservation.id, "os-api-001");
    assert.equal(observation.osObservation.unmanagedAgents.length, 1);

    const status = await getJson(port, "/api/os/status?mission=mission-api-os");
    assert.equal(status.osObservations.length, 1);
    assert.equal(status.osObservations[0].unmanagedAgents[0].name, "claude");

    const context = await getJson(port, "/api/codex/context?mission=mission-api-os");
    assert.equal(context.osObservations[0].id, "os-api-001");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
