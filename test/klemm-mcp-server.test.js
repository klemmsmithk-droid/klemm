import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MCP_PATH = join(process.cwd(), "src", "klemm-mcp-server.js");

test("real MCP stdio server lists and calls Klemm tools over JSON-RPC", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-mcp-"));
  const child = spawn(process.execPath, ["--no-warnings", MCP_PATH], {
    cwd: process.cwd(),
    env: { ...process.env, KLEMM_DATA_DIR: dataDir },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = [];
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      responses.push(JSON.parse(line));
    }
  });

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "start_mission",
      arguments: { id: "mission-mcp", goal: "Supervise MCP agents." },
    },
  })}\n`);

  await waitFor(() => responses.length >= 3);
  child.kill("SIGTERM");

  assert.equal(responses[0].result.serverInfo.name, "klemm");
  assert.equal(responses[0].result.capabilities.tools.listChanged, false);
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "record_agent_activity"));
  assert.equal(responses[1].result.tools[0].inputSchema.type, "object");
  assert.deepEqual(JSON.parse(responses[2].result.content[0].text).mission.id, "mission-mcp");
});

async function waitFor(fn, { timeoutMs = 2000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for MCP responses");
}
