import test from "node:test";
import assert from "node:assert/strict";

import { createInitialKlemmState, distillMemory, proposeAction, reviewMemory, startMission } from "../src/klemm.js";

test("reviewed authority memories become explainable policy matches for future actions", () => {
  const now = "2026-05-03T12:00:00.000Z";
  const state = startMission(createInitialKlemmState({ now }), {
    id: "mission-policy",
    hub: "terminal",
    goal: "Let agents edit locally, but do not publish externally.",
    now,
  });
  const withMemory = distillMemory(state, {
    source: "chatgpt_export",
    sourceRef: "conversation-policy",
    text: "Do not let agents deploy to production without approval.",
    now,
  });
  const memoryId = withMemory.memories[0].id;
  const reviewed = reviewMemory(withMemory, {
    memoryId,
    status: "approved",
    note: "Standing deployment boundary.",
    now,
  });

  const next = proposeAction(reviewed, {
    id: "decision-deploy",
    missionId: "mission-policy",
    actor: "Shell Agent",
    actionType: "command",
    target: "vercel deploy --prod",
    missionRelevance: "related",
    now,
  });

  assert.equal(next.decisions[0].decision, "queue");
  assert.equal(next.decisions[0].riskLevel, "high");
  assert.match(next.decisions[0].reason, /memory policy/i);
  assert.deepEqual(next.decisions[0].matchedPolicies, [
    {
      id: memoryId,
      source: "conversation-policy",
      memoryClass: "authority_boundary",
      text: "Do not let agents deploy to production without approval.",
    },
  ]);
});

