import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  addAdapterClient,
  addStructuredPolicy,
  createInitialKlemmState,
  normalizeAgentAdapterEnvelope,
  proposeAction,
  simulatePolicyDecision,
  startMission,
} from "../src/klemm.js";
import { executeKlemmTool } from "../src/klemm-tools.js";

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

test("Policy Engine v2 returns scored explainable decisions with policy effects", () => {
  let state = startMission(createInitialKlemmState(), {
    id: "mission-policy-v2",
    goal: "Protect credentials.",
  });
  state = addStructuredPolicy(state, {
    id: "policy-credentials-deny",
    name: "Credential changes are denied while AFK",
    effect: "deny",
    severity: "critical",
    condition: {
      actionTypes: ["credential_change"],
      targetIncludes: ["token", "oauth"],
    },
  });

  const next = proposeAction(state, {
    id: "decision-token",
    missionId: "mission-policy-v2",
    actor: "Codex",
    actionType: "credential_change",
    target: "rotate production OAuth token",
    credentialImpact: true,
    missionRelevance: "related",
  });
  const decision = next.decisions[0];

  assert.equal(decision.authorityVersion, "policy-v2");
  assert.equal(decision.decision, "deny");
  assert.equal(decision.riskLevel, "critical");
  assert.equal(decision.actionCategory, "credentials");
  assert.ok(decision.riskScore >= 90);
  assert.ok(decision.riskFactors.some((factor) => factor.id === "credential_impact"));
  assert.match(decision.explanation.summary, /Credential changes/);
  assert.equal(decision.explanation.evidence.policies[0].id, "policy-credentials-deny");
});

test("mission authority overrides can downgrade otherwise blocked actions with an audit explanation", () => {
  const state = startMission(createInitialKlemmState(), {
    id: "mission-release",
    goal: "Release a tagged package.",
    blockedActions: ["git_push"],
    authorityOverrides: [
      {
        actionTypes: ["git_push"],
        targetIncludes: ["refs/tags/v1.2.3"],
        effect: "allow",
        reason: "User explicitly authorized this release tag.",
      },
    ],
  });

  const next = proposeAction(state, {
    id: "decision-release-tag",
    missionId: "mission-release",
    actor: "Release Agent",
    actionType: "git_push",
    target: "origin refs/tags/v1.2.3",
    externality: "git_push",
    missionRelevance: "related",
  });

  assert.equal(next.decisions[0].decision, "allow");
  assert.equal(next.decisions[0].riskLevel, "medium");
  assert.match(next.decisions[0].reason, /authorized this release tag/);
  assert.ok(next.decisions[0].riskFactors.some((factor) => factor.id === "mission_override"));
});

test("policy simulation is side-effect free and exposes risk factors", () => {
  let state = startMission(createInitialKlemmState(), {
    id: "mission-sim",
    blockedActions: ["deployment"],
  });
  state = addStructuredPolicy(state, {
    id: "policy-prod",
    name: "Production deploy review",
    condition: { actionTypes: ["deployment"], targetIncludes: ["prod"] },
  });

  const simulation = simulatePolicyDecision(state, {
    missionId: "mission-sim",
    actor: "Deploy Agent",
    actionType: "deployment",
    target: "deploy prod",
    externality: "deployment",
    missionRelevance: "related",
  });

  assert.equal(simulation.decision, "queue");
  assert.equal(simulation.persisted, false);
  assert.equal(state.decisions.length, 0);
  assert.ok(simulation.riskScore >= 80);
  assert.ok(simulation.matchedPolicies.some((policy) => policy.id === "policy-prod"));
});

test("adapter protocol validates versions and local client tokens", () => {
  let state = addAdapterClient(createInitialKlemmState(), {
    id: "codex-local",
    token: "token-123",
    protocolVersions: [1, 2],
    permissions: ["record_adapter_envelope"],
  });

  const rejected = executeKlemmTool("record_adapter_envelope", {
    protocolVersion: 3,
    adapterClientId: "codex-local",
    adapterToken: "wrong",
    event: "tool_call",
    agentId: "agent-codex",
    toolCall: { name: "shell", arguments: { command: "npm test" } },
  }, { state });
  assert.equal(rejected.result.accepted, false);
  assert.match(rejected.result.error, /token/i);
  assert.equal(rejected.state.agentActivities.length, 0);

  const accepted = executeKlemmTool("record_adapter_envelope", {
    protocolVersion: 2,
    adapterClientId: "codex-local",
    adapterToken: "token-123",
    event: "tool_call",
    missionId: "mission-adapter-v2",
    agentId: "agent-codex",
    toolCall: { name: "shell", arguments: { command: "npm test" } },
  }, { state });
  assert.equal(accepted.result.accepted, true);
  assert.equal(accepted.result.protocol.negotiatedVersion, 2);
  assert.equal(accepted.result.envelope.validation.accepted, true);
});

test("CLI policy simulate and adapter token flows work together", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-policy-v2-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-cli-policy", "--goal", "Simulate authority"]);
  const policy = await runKlemm(["policy", "add", "--id", "policy-cli-prod", "--name", "Prod deploy review", "--action-types", "deployment", "--target-includes", "prod"], { env });
  assert.equal(policy.status, 0, policy.stderr);

  const simulation = await runKlemm(["policy", "simulate", "--mission", "mission-cli-policy", "--actor", "Codex", "--type", "deployment", "--target", "deploy prod", "--external", "deployment"], { env });
  assert.equal(simulation.status, 0, simulation.stderr);
  assert.match(simulation.stdout, /Policy simulation/);
  assert.match(simulation.stdout, /Decision: queue/);
  assert.match(simulation.stdout, /Risk score:/);
  assert.match(simulation.stdout, /policy-cli-prod/);

  const token = await runKlemm(["adapter", "token", "add", "--id", "codex-local", "--token", "token-123", "--versions", "1,2"], { env });
  assert.equal(token.status, 0, token.stderr);
  assert.match(token.stdout, /Adapter client added: codex-local/);

  const report = await runKlemm(["codex", "report", "--adapter-client", "codex-local", "--adapter-token", "token-123", "--protocol-version", "2", "--mission", "mission-cli-policy", "--type", "tool_call", "--tool", "shell", "--command", "npm test"], { env });
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /Adapter accepted: true/);
  assert.match(report.stdout, /Protocol: 2/);
});
