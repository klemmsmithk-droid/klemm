import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

import {
  addReviewedProxyMemory,
  createInitialKlemmState,
  evaluateAgentAlignment,
  importContextSource,
  recordAgentActivity,
  startGoal,
} from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";
import { createKlemmAdapterClient, createKlemmHttpTransport } from "../src/klemm-adapter-sdk.js";
import { executeKlemmTool } from "../src/klemm-tools.js";

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

function seededState() {
  let state = createInitialKlemmState({ now: "2026-05-04T14:00:00.000Z" });
  state = startGoal(state, {
    id: "goal-agent-loop",
    text: "Build Klemm proxy agent loop",
    success: "agent-facing proxy loop works",
    watchPaths: ["src", "test", ".agents"],
    now: "2026-05-04T14:00:00.000Z",
  });
  state = addReviewedProxyMemory(state, {
    id: "memory-agent-loop-proceed",
    text: "Kyle uses proceed and what's next to mean continue safe local implementation work that remains aligned with the active goal.",
    memoryClass: "standing_preference",
    now: "2026-05-04T14:00:01.000Z",
  });
  return state;
}

test("adapter SDK lets agents ask and continue through the proxy over HTTP transport", async () => {
  let state = seededState();
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const client = createKlemmAdapterClient({
      missionId: "mission-goal-agent-loop",
      agentId: "agent-claude",
      transport: createKlemmHttpTransport({ baseUrl: `http://127.0.0.1:${port}` }),
    });

    const answer = await client.proxyAsk({
      goalId: "goal-agent-loop",
      question: "The user said proceed. Should I continue with the safe local plan?",
      context: "Local implementation and tests only.",
    });
    assert.equal(answer.answer.confidence, "high");
    assert.equal(answer.answer.shouldContinue, true);

    const continuation = await client.proxyContinue({ goalId: "goal-agent-loop" });
    assert.equal(continuation.continuation.shouldContinue, true);
    assert.match(continuation.continuation.nextPrompt, /Continue implementation/);
    assert.equal(state.proxyQuestions.length, 1);
    assert.equal(state.proxyContinuations.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("codex wrapper exposes proxy commands as the default plan-mode loop", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-proxy-loop-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const wrapped = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-codex-proxy-loop",
    "--goal",
    "Use proxy loop",
    "--plan",
    "Ask Klemm before interrupting Kyle.",
    "--dry-run",
    "--",
    "node",
    "-e",
    "console.log('wrapped')",
  ], { env });

  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.match(wrapped.stdout, /Proxy ask:/);
  assert.match(wrapped.stdout, /klemm proxy ask --goal mission-codex-proxy-loop/);
  assert.match(wrapped.stdout, /Proxy continue:/);
  assert.match(wrapped.stdout, /KLEMM_PROXY_ASK_COMMAND/);
  assert.match(wrapped.stdout, /Plan reported: accepted/);
});

test("context import extracts prompt intent patterns as pending proxy memories", () => {
  const state = importContextSource(createInitialKlemmState(), {
    provider: "codex",
    sourceRef: "codex-history.jsonl",
    payload: [
      JSON.stringify({ role: "user", content: "what's next?" }),
      JSON.stringify({ role: "user", content: "proceed" }),
      JSON.stringify({ role: "user", content: "do all that. no corners cut. dogfood Klemm." }),
    ].join("\n"),
    now: "2026-05-04T14:10:00.000Z",
  });

  const proxyMemories = state.memories.filter((memory) => memory.memoryClass === "prompt_intent_pattern");
  assert.ok(proxyMemories.length >= 2);
  assert.ok(proxyMemories.some((memory) => /what's next/i.test(memory.text)));
  assert.ok(proxyMemories.some((memory) => /proceed/i.test(memory.text)));
  assert.ok(proxyMemories.every((memory) => memory.status === "pending_review"));
  assert.ok(proxyMemories.every((memory) => memory.evidence?.provider === "codex"));
});

test("proxy TUI review workbench shows answer reviews and correction choices", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-proxy-review-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["goal", "start", "--id", "goal-proxy-review", "--text", "Review proxy answers", "--success", "reviewed"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-review-proceed", "--text", "Kyle uses proceed to continue safe local implementation work."], { env });
  const ask = await runKlemm(["proxy", "ask", "--goal", "goal-proxy-review", "--agent", "agent-codex", "--question", "Should I proceed?", "--context", "The user said proceed."], { env });
  const answerId = ask.stdout.match(/Answer ID: (proxy-answer-[^\s]+)/)?.[1];
  assert.ok(answerId, ask.stdout);

  const review = await runKlemm(["proxy", "review", "--answer", answerId, "--status", "good_answer", "--note", "Make this a rule for safe local work."], { env });
  assert.equal(review.status, 0, review.stderr);

  const tui = await runKlemm(["tui", "--view", "proxy"], { env });
  assert.match(tui.stdout, /Proxy Review Inbox/);
  assert.match(tui.stdout, /good_answer/);
  assert.match(tui.stdout, /Make this a rule/);
  assert.match(tui.stdout, /Choices: good_answer, too_aggressive, should_have_asked, make_rule/);
});

test("proxy continuation switches strategy on nudge and pauses on stuck work", () => {
  let state = seededState();
  state = recordAgentActivity(state, {
    missionId: "mission-goal-agent-loop",
    agentId: "agent-codex",
    type: "command",
    summary: "Focused suite failed once",
    target: "npm test -- test/klemm-proxy-agent-loop.test.js",
    exitCode: 1,
    now: "2026-05-04T14:20:00.000Z",
  });
  state = evaluateAgentAlignment(state, {
    missionId: "mission-goal-agent-loop",
    agentId: "agent-codex",
    now: "2026-05-04T14:20:01.000Z",
  });

  let continued = executeKlemmTool("proxy_continue", {
    goalId: "goal-agent-loop",
    agentId: "agent-codex",
    now: "2026-05-04T14:20:02.000Z",
  }, { state });
  assert.equal(continued.result.continuation.shouldContinue, true);
  assert.equal(continued.result.continuation.confidence, "medium");
  assert.match(continued.result.continuation.nextPrompt, /switch strategy/i);

  state = continued.state;
  for (let index = 0; index < 3; index += 1) {
    state = recordAgentActivity(state, {
      missionId: "mission-goal-agent-loop",
      agentId: "agent-codex",
      type: "command",
      summary: `Repeated failure ${index + 1}`,
      target: "npm test",
      exitCode: 1,
      now: `2026-05-04T14:21:0${index}.000Z`,
    });
  }
  state = evaluateAgentAlignment(state, {
    missionId: "mission-goal-agent-loop",
    agentId: "agent-codex",
    now: "2026-05-04T14:21:10.000Z",
  });
  continued = executeKlemmTool("proxy_continue", {
    goalId: "goal-agent-loop",
    agentId: "agent-codex",
    now: "2026-05-04T14:21:11.000Z",
  }, { state });
  assert.equal(continued.result.continuation.shouldContinue, false);
  assert.match(continued.result.continuation.nextPrompt, /summarize and pause/i);
});
