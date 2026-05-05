import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createKlemmAdapterClient,
  createKlemmHttpTransport,
  createKlemmMcpTransport,
} from "../src/klemm-adapter-sdk.js";
import { createInitialKlemmState, startMission, addAdapterClient } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");
const MCP_PATH = join(process.cwd(), "src", "klemm-mcp-server.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 5000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
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
    child.stdin.end(input);
  });
}

test("HTTP adapter transport retries and negotiates supported protocol versions", async () => {
  let state = startMission(createInitialKlemmState(), { id: "mission-http-transport", goal: "Report over HTTP." });
  state = addAdapterClient(state, {
    id: "codex-local",
    token: "token-123",
    protocolVersions: [1],
  });
  let attempts = 0;
  const server = createServer((request, response) => {
    if (request.url === "/api/adapter/envelope" && attempts === 0) {
      attempts += 1;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "warming_up" }));
      return;
    }
    attempts += 1;
    createKlemmHttpServer({
      getState: () => state,
      saveState: (next) => {
        state = next;
      },
    }).emit("request", request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const client = createKlemmAdapterClient({
      adapterClientId: "codex-local",
      adapterToken: "token-123",
      protocolVersion: 2,
      missionId: "mission-http-transport",
      agentId: "agent-codex",
      transport: createKlemmHttpTransport({ baseUrl, retries: 2, negotiateProtocol: true }),
    });
    const result = await client.send(client.toolCall({ tool: "shell", command: "npm test", summary: "Run tests." }));

    assert.equal(result.accepted, true);
    assert.equal(result.protocol.negotiatedVersion, 1);
    assert.equal(attempts, 3);
    assert.equal(state.agentActivities.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("MCP adapter transport records envelopes through Klemm's stdio server", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-mcp-transport-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  assert.equal((await runKlemm(["mission", "start", "--id", "mission-mcp-transport", "--goal", "Report over MCP"], { env })).status, 0);
  assert.equal((await runKlemm(["adapter", "token", "add", "--id", "codex-local", "--token", "token-123", "--versions", "1,2"], { env })).status, 0);

  const client = createKlemmAdapterClient({
    adapterClientId: "codex-local",
    adapterToken: "token-123",
    protocolVersion: 2,
    missionId: "mission-mcp-transport",
    agentId: "agent-codex",
    transport: createKlemmMcpTransport({
      command: process.execPath,
      args: ["--no-warnings", MCP_PATH],
      env: { ...process.env, ...env },
    }),
  });
  const result = await client.send(client.plan({ summary: "Plan through MCP.", plan: "Report plan." }));

  assert.equal(result.accepted, true);
  assert.equal(result.protocol.negotiatedVersion, 2);
});

test("codex wrapper dogfoods a full session with mission, plan, guarded command, and debrief", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-wrap-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  assert.equal((await runKlemm(["adapter", "token", "add", "--id", "codex-local", "--token", "token-123", "--versions", "1,2"], { env })).status, 0);

  const wrap = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-wrap",
    "--goal",
    "Dogfood wrapped Codex",
    "--adapter-client",
    "codex-local",
    "--adapter-token",
    "token-123",
    "--protocol-version",
    "2",
    "--dry-run",
    "--plan",
    "Inspect, run safe command, debrief.",
    "--",
    "git",
    "push",
    "origin",
    "main",
  ], { env });

  assert.equal(wrap.status, 0, wrap.stderr);
  assert.match(wrap.stdout, /Codex wrapper session started: mission-wrap/);
  assert.match(wrap.stdout, /Plan reported: accepted/);
  assert.match(wrap.stdout, /Guarded command decision: queue/);
  assert.match(wrap.stdout, /Dry run: Codex launch skipped/);
  assert.match(wrap.stdout, /Debrief reported: accepted/);
  assert.match(wrap.stdout, /Review this session:/);
  assert.match(wrap.stdout, /KLEMM_DATA_DIR=/);
  assert.match(wrap.stdout, /klemm debrief --mission mission-wrap/);

  const debrief = await runKlemm(["debrief", "--mission", "mission-wrap"], { env });
  assert.match(debrief.stdout, /Queued: 1/);
});

test("codex wrapper resolves an explicit Codex command when launching default session", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-command-"));
  const fakeCodexPath = join(dataDir, "fake-codex.js");
  await writeFile(fakeCodexPath, "console.log('fake codex launched');", "utf8");
  const env = { KLEMM_DATA_DIR: dataDir, KLEMM_CODEX_COMMAND: `${process.execPath} ${fakeCodexPath}` };

  const wrap = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-default-codex",
    "--goal",
    "Launch default Codex command",
  ], { env });

  assert.equal(wrap.status, 0, wrap.stderr);
  assert.match(wrap.stdout, /Codex wrapper session started: mission-default-codex/);
  assert.match(wrap.stdout, /fake codex launched/);
  assert.match(wrap.stdout, /Klemm supervised exit: 0/);
});

test("codex wrapper reports a helpful message when Codex command is missing", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-missing-"));
  const env = { KLEMM_DATA_DIR: dataDir, KLEMM_CODEX_COMMAND: "missing-codex-binary-for-test" };

  const wrap = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-missing-codex",
    "--goal",
    "Launch missing Codex command",
  ], { env });

  assert.equal(wrap.status, 127, wrap.stderr);
  assert.match(wrap.stdout, /Klemm could not find command: missing-codex-binary-for-test/);
  assert.match(wrap.stdout, /Set KLEMM_CODEX_COMMAND/);
});

test("runtime profiles v2 load config files, inject env, default missions, and adapter tokens", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-runtime-v2-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const scriptPath = join(dataDir, "print-env.js");
  const profilePath = join(dataDir, "profiles.json");
  await writeFile(scriptPath, "console.log(process.env.KLEMM_PROFILE_NAME); console.log(process.env.KLEMM_ADAPTER_TOKEN);", "utf8");
  await writeFile(profilePath, JSON.stringify({
    profiles: {
      localcodex: {
        extends: "shell",
        agentId: "agent-profile-codex",
        name: "Profile Codex",
        kind: "codex_agent",
        defaultMission: {
          id: "mission-profile",
          goal: "Runtime profile mission",
          blockedActions: ["git_push"],
        },
        command: ["node", scriptPath],
        env: {
          KLEMM_PROFILE_NAME: "localcodex",
        },
        adapterClientId: "codex-local",
        adapterToken: "profile-token",
        protocolVersions: [2],
        authority: {
          blockedActions: ["deployment"],
        },
      },
    },
  }), "utf8");

  const result = await runKlemm(["run", "localcodex", "--profile-file", profilePath, "--capture"], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Runtime profile loaded: localcodex/);
  assert.match(result.stdout, /Default mission started: mission-profile/);
  assert.match(result.stdout, /Adapter client ensured: codex-local/);
  assert.match(result.stdout, /localcodex/);
  assert.match(result.stdout, /profile-token/);

  const agents = await runKlemm(["agents"], { env });
  assert.match(agents.stdout, /1\. Profile Codex/);
  assert.match(agents.stdout, /Status: Active/);
  assert.match(agents.stdout, /Mission: Runtime profile mission/);
  assert.match(agents.stdout, /ID: agent-profile-codex/);
  assert.match(agents.stdout, /Mission ID: mission-profile/);
});

test("decision queue inspect and TUI rewrite show rewrite, memories, and policy evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-queue-ux-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-queue-ux", "--goal", "Inspect queue decisions"], { env });
  await runKlemm(["memory", "ingest-export", "--source", "chatgpt_export", "--text", JSON.stringify([{ role: "user", content: "Never deploy production without approval." }])], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/- (memory-[^\s]+)/)?.[1];
  assert.ok(memoryId);
  await runKlemm(["memory", "approve", memoryId, "trusted boundary"], { env });
  await runKlemm(["memory", "promote-policy", memoryId, "--action-types", "deployment", "--target-includes", "prod,production"], { env });
  await runKlemm(["propose", "--id", "decision-queue", "--mission", "mission-queue-ux", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment", "--suggested-rewrite", "npm test"], { env });

  const inspect = await runKlemm(["queue", "inspect", "decision-queue"], { env });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.match(inspect.stdout, /Decision Detail/);
  assert.match(inspect.stdout, /Suggested rewrite: npm test/);
  assert.match(inspect.stdout, /Source memories:/);
  assert.match(inspect.stdout, new RegExp(memoryId));
  assert.match(inspect.stdout, /Matched policies:/);

  const tui = await runKlemm(["tui", "--interactive", "--mission", "mission-queue-ux"], {
    env,
    input: "inspect decision-queue\nrewrite decision-queue Use local tests only\nquit\n",
  });
  assert.equal(tui.status, 0, tui.stderr);
  assert.match(tui.stdout, /Decision Detail/);
  assert.match(tui.stdout, /Suggested rewrite: npm test/);
  assert.match(tui.stdout, /Decision recorded: rewritten/);
});

test("policy packs install prebuilt authority rules for common modes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-policy-packs-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const list = await runKlemm(["policy", "pack", "list"], { env });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /coding-afk/);
  assert.match(list.stdout, /strict-no-external/);

  const apply = await runKlemm(["policy", "pack", "apply", "strict-no-external", "--mission", "mission-packs"], { env });
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /Policy pack applied: strict-no-external/);
  assert.match(apply.stdout, /Policies added:/);

  await runKlemm(["mission", "start", "--id", "mission-packs", "--goal", "No external actions"], { env });
  const simulation = await runKlemm(["policy", "simulate", "--mission", "mission-packs", "--type", "external_send", "--target", "send email", "--external", "email"], { env });
  assert.match(simulation.stdout, /Decision: queue/);
  assert.match(simulation.stdout, /strict-no-external/);
});
