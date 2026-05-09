import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  addStructuredPolicy,
  createInitialKlemmState,
  importMemorySource,
  normalizeAgentAdapterEnvelope,
  renderLaunchAgentPlist,
  searchMemories,
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

test("adapter protocol normalizes plan, tool, diff, and uncertainty envelopes", () => {
  const envelope = normalizeAgentAdapterEnvelope({
    protocolVersion: 1,
    missionId: "mission-adapter",
    agentId: "agent-codex",
    event: "tool_call",
    summary: "Run focused tests",
    toolCall: { name: "shell", arguments: { command: "npm test -- test/klemm.test.js" } },
  });

  assert.equal(envelope.type, "tool_call");
  assert.equal(envelope.activity.type, "tool_call");
  assert.equal(envelope.activity.target, "shell");
  assert.equal(envelope.action.actionType, "command");
});

test("structured policy can require review before matching actions", () => {
  const state = addStructuredPolicy(startMission(createInitialKlemmState(), {
    id: "mission-policy-v2",
    goal: "Ship safely.",
  }), {
    id: "policy-deploy",
    name: "Deployment approval",
    condition: { actionTypes: ["deployment"], targetIncludes: ["prod"] },
    effect: "queue",
    severity: "high",
    source: "manual",
  });

  assert.equal(state.policies[0].id, "policy-deploy");
  assert.equal(state.policies[0].status, "active");
});

test("memory v2 imports provider exports with source records and supports search", () => {
  const state = importMemorySource(createInitialKlemmState(), {
    source: "chatgpt",
    sourceRef: "export.json",
    payload: JSON.stringify({
      conversations: [
        { messages: [{ role: "user", content: "I prefer terminal-first agent tools and explicit review before deploys." }] },
      ],
    }),
  });

  assert.equal(state.memorySources[0].provider, "chatgpt");
  assert.ok(state.memories.some((memory) => memory.text.includes("terminal-first")));
  assert.equal(searchMemories(state, { query: "deploy review" }).length, 1);
});

test("LaunchAgent helper scaffold renders a plist for the local daemon", () => {
  const plist = renderLaunchAgentPlist({
    label: "com.klemm.daemon",
    program: "/usr/local/bin/klemm",
    dataDir: "/Users/example/Library/Application Support/Klemm",
  });

  assert.match(plist, /com\.klemm\.daemon/);
  assert.match(plist, /klemm/);
  assert.match(plist, /daemon/);
});

test("supervise --watch-loop emits heartbeat monitor evaluations during a long run", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-loop-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-loop", "--goal", "Observe a long running agent"], { env });

  const result = await runKlemm(
    ["supervise", "--watch-loop", "--watch-interval-ms", "50", "--mission", "mission-loop", "--", "node", "-e", "setTimeout(()=>console.log('done'), 160)"],
    { env },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Klemm heartbeat:/);
  assert.match(result.stdout, /Klemm alignment:/);
});
