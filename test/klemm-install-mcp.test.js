import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

test("klemm install mcp prints client config snippets for Codex and Claude Desktop", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-install-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const codex = await runKlemm(["install", "mcp", "--client", "codex"], { env });
  assert.equal(codex.status, 0, codex.stderr);
  assert.match(codex.stdout, /Klemm MCP config for codex/);
  const codexConfig = JSON.parse(codex.stdout.match(/\{[\s\S]*\}/)[0]);
  assert.equal(codexConfig.mcpServers.klemm.command, process.execPath);
  assert.deepEqual(codexConfig.mcpServers.klemm.args.slice(-1), [join(process.cwd(), "src", "klemm-mcp-server.js")]);

  const claude = await runKlemm(["install", "mcp", "--client", "claude-desktop"], { env });
  assert.equal(claude.status, 0, claude.stderr);
  assert.match(claude.stdout, /Klemm MCP config for claude-desktop/);
  assert.match(claude.stdout, /mcpServers/);
});

test("klemm install mcp writes config when an output path is provided", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-install-"));
  const output = join(dataDir, "mcp.json");
  const env = { KLEMM_DATA_DIR: dataDir };

  const result = await runKlemm(["install", "mcp", "--client", "generic", "--output", output], { env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MCP config written:/);
  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.mcpServers.klemm.env.KLEMM_DATA_DIR, dataDir);
});
