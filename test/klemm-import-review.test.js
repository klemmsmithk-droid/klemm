import test from "node:test";
import assert from "node:assert/strict";

import { createInitialKlemmState, ingestMemoryExport, reviewMemory } from "../src/klemm.js";

test("chat history import dedupes memory candidates and supports review promotion", () => {
  const state = createInitialKlemmState({ now: "2026-05-03T17:00:00.000Z" });
  const next = ingestMemoryExport(state, {
    source: "claude_export",
    sourceRef: "claude.json",
    text: JSON.stringify([
      { role: "user", content: "I prefer terminal-first tools." },
      { role: "user", content: "I prefer terminal-first tools." },
      { role: "user", content: "Never let agents send emails without approval." },
    ]),
    now: "2026-05-03T17:00:00.000Z",
  });

  assert.equal(next.imports[0].messageCount, 3);
  assert.equal(next.imports[0].duplicateCount, 1);
  assert.equal(next.memories.length, 2);

  const memory = next.memories.find((item) => item.text.includes("terminal-first"));
  const reviewed = reviewMemory(next, {
    memoryId: memory.id,
    status: "approved",
    note: "Core product taste.",
    now: "2026-05-03T17:01:00.000Z",
  });

  const approved = reviewed.memories.find((item) => item.id === memory.id);
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewNote, "Core product taste.");
  assert.equal(approved.reviewedAt, "2026-05-03T17:01:00.000Z");
});
