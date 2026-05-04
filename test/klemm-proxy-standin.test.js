import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

import {
  addReviewedProxyMemory,
  createInitialKlemmState,
  recordAgentActivity,
  startGoal,
} from "../src/klemm.js";
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

function seededProxyState() {
  let state = createInitialKlemmState({ now: "2026-05-04T12:00:00.000Z" });
  state = startGoal(state, {
    id: "goal-proxy",
    text: "Build Klemm Proxy / User Stand-In v1",
    success: "tests pass and commit pushed",
    watchPaths: ["src", "test", ".agents"],
    now: "2026-05-04T12:00:00.000Z",
  });
  state = addReviewedProxyMemory(state, {
    id: "memory-proxy-proceed",
    text: "Kyle uses proceed and what's next to mean continue the previously discussed implementation work when it is local, low-risk, and aligned.",
    memoryClass: "standing_preference",
    source: "seeded_test",
    now: "2026-05-04T12:00:01.000Z",
  });
  state = addReviewedProxyMemory(state, {
    id: "memory-proxy-no-corners",
    text: "Kyle prefers no corners cut and do all that to mean implement all listed safe local steps, dogfood Klemm, test thoroughly, commit, and push when verified.",
    memoryClass: "standing_preference",
    source: "seeded_test",
    now: "2026-05-04T12:00:02.000Z",
  });
  return state;
}

test("proxy asks answer high-confidence user stand-in questions from reviewed memory", () => {
  const toolNames = KLEMM_MCP_TOOLS.map((tool) => tool.name);
  for (const name of ["proxy_ask", "proxy_continue", "proxy_status", "proxy_review"]) {
    assert.ok(toolNames.includes(name), `${name} should be an MCP tool`);
  }

  let state = seededProxyState();
  const asked = executeKlemmTool("proxy_ask", {
    id: "proxy-question-plan",
    goalId: "goal-proxy",
    agentId: "agent-codex",
    question: "Should I do all five steps or start smaller?",
    context: "The user said no corners cut and asked us to proceed.",
    now: "2026-05-04T12:01:00.000Z",
  }, { state });
  state = asked.state;

  assert.equal(asked.result.answer.confidence, "high");
  assert.equal(asked.result.answer.escalationRequired, false);
  assert.equal(asked.result.answer.shouldContinue, true);
  assert.match(asked.result.answer.answer, /Proceed with all listed safe local steps/);
  assert.match(asked.result.answer.nextPrompt, /dogfood Klemm/);
  assert.deepEqual(asked.result.answer.evidenceMemoryIds.sort(), ["memory-proxy-no-corners", "memory-proxy-proceed"].sort());
  assert.equal(state.proxyQuestions.length, 1);
  assert.equal(state.proxyAnswers.length, 1);
  assert.equal(state.queue.length, 0);
});

test("proxy queues low-confidence and high-risk questions instead of impersonating the user", () => {
  let state = seededProxyState();
  const low = executeKlemmTool("proxy_ask", {
    id: "proxy-question-unknown",
    goalId: "goal-proxy",
    agentId: "agent-cursor",
    question: "Should I rename the product and change its audience?",
    now: "2026-05-04T12:02:00.000Z",
  }, { state });
  state = low.state;
  assert.equal(low.result.answer.confidence, "low");
  assert.equal(low.result.answer.escalationRequired, true);
  assert.equal(low.result.answer.shouldContinue, false);
  assert.equal(state.queue[0].id, low.result.answer.queuedDecisionId);

  const risky = executeKlemmTool("proxy_ask", {
    id: "proxy-question-risk",
    goalId: "goal-proxy",
    agentId: "agent-codex",
    question: "Should I deploy production and push to GitHub now?",
    context: "The user likes no corners cut.",
    now: "2026-05-04T12:03:00.000Z",
  }, { state });
  assert.equal(risky.result.answer.confidence, "low");
  assert.equal(risky.result.answer.riskLevel, "high");
  assert.equal(risky.result.answer.escalationRequired, true);
  assert.match(risky.result.answer.answer, /ask Kyle/i);
});

test("proxy continuation emits next prompt only when aligned and queue is clean", () => {
  let state = seededProxyState();
  state = recordAgentActivity(state, {
    missionId: "mission-goal-proxy",
    agentId: "agent-codex",
    type: "command",
    summary: "Focused proxy tests passed",
    target: "npm test -- test/klemm-proxy-standin.test.js",
    exitCode: 0,
    now: "2026-05-04T12:04:00.000Z",
  });

  const continued = executeKlemmTool("proxy_continue", {
    goalId: "goal-proxy",
    agentId: "agent-codex",
    now: "2026-05-04T12:05:00.000Z",
  }, { state });
  state = continued.state;
  assert.equal(continued.result.continuation.shouldContinue, true);
  assert.equal(continued.result.continuation.escalationRequired, false);
  assert.match(continued.result.continuation.nextPrompt, /Continue implementation/);
  assert.match(continued.result.continuation.nextPrompt, /do not push or deploy without queue approval/);

  const blocked = executeKlemmTool("proxy_ask", {
    goalId: "goal-proxy",
    agentId: "agent-codex",
    question: "Should I publish the package?",
    now: "2026-05-04T12:06:00.000Z",
  }, { state });
  state = blocked.state;
  const refused = executeKlemmTool("proxy_continue", {
    goalId: "goal-proxy",
    agentId: "agent-codex",
    now: "2026-05-04T12:07:00.000Z",
  }, { state });
  assert.equal(refused.result.continuation.shouldContinue, false);
  assert.equal(refused.result.continuation.escalationRequired, true);
  assert.match(refused.result.continuation.nextPrompt, /Pause and ask Kyle/);
});

test("daemon exposes proxy endpoints and persists proxy records", async () => {
  let state = seededProxyState();
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const answer = await requestJson(port, "/api/proxy/ask", {
      goalId: "goal-proxy",
      agentId: "agent-claude",
      question: "The user said proceed. Should I keep going?",
      context: "Local code/test work only.",
    });
    assert.equal(answer.answer.confidence, "high");
    assert.equal(answer.answer.shouldContinue, true);

    const continuation = await requestJson(port, "/api/proxy/continue", {
      goalId: "goal-proxy",
      agentId: "agent-claude",
    });
    assert.match(continuation.continuation.nextPrompt, /Continue implementation|Proceed/);

    const status = await getJson(port, "/api/proxy/status?goal=goal-proxy");
    assert.equal(status.questions.length, 1);
    assert.equal(status.answers.length, 1);
    assert.equal(status.continuations.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("proxy CLI, TUI, and trust explain user stand-in behavior", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-proxy-cli-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["goal", "start", "--id", "goal-cli-proxy", "--text", "Build proxy CLI", "--success", "tests pass", "--watch-path", "src"], { env });
  await runKlemm(["memory", "seed-proxy", "--id", "memory-cli-proceed", "--text", "Kyle uses proceed and what's next to mean continue safe local implementation work."], { env });

  const ask = await runKlemm(["proxy", "ask", "--goal", "goal-cli-proxy", "--agent", "agent-codex", "--question", "Should I proceed with all local steps?", "--context", "The user said proceed"], { env });
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /Klemm proxy answer/);
  assert.match(ask.stdout, /Confidence: high/);
  assert.match(ask.stdout, /Should continue: yes/);

  const cont = await runKlemm(["proxy", "continue", "--goal", "goal-cli-proxy", "--agent", "agent-codex"], { env });
  assert.equal(cont.status, 0, cont.stderr);
  assert.match(cont.stdout, /Klemm proxy continuation/);
  assert.match(cont.stdout, /Next prompt:/);

  const status = await runKlemm(["proxy", "status", "--goal", "goal-cli-proxy"], { env });
  assert.match(status.stdout, /Klemm proxy status/);
  assert.match(status.stdout, /Questions: 1/);

  const tui = await runKlemm(["tui", "--view", "proxy"], { env });
  assert.match(tui.stdout, /Klemm Proxy/);
  assert.match(tui.stdout, /goal-cli-proxy/);
  assert.match(tui.stdout, /high/);

  const answerId = ask.stdout.match(/Answer ID: (proxy-answer-[^\s]+)/)?.[1];
  assert.ok(answerId, ask.stdout);
  const why = await runKlemm(["trust", "why", "--proxy", answerId], { env });
  assert.match(why.stdout, /Why Klemm answered for Kyle/);
  assert.match(why.stdout, /Evidence memories:/);
  assert.match(why.stdout, /memory-cli-proceed/);
});

test("/klemm skill tells Codex to ask proxy mode before interrupting the user", async () => {
  const skill = await readFile(join(process.cwd(), ".agents", "skills", "klemm", "SKILL.md"), "utf8");
  assert.match(skill, /proxy ask/);
  assert.match(skill, /proxy continue/);
  assert.match(skill, /plan mode/i);
  assert.match(skill, /ask Klemm before asking the user/i);
  assert.match(skill, /high-confidence proxy answers/i);
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
