import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 3000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: 124, stdout, stderr: `${stderr}\nTimed out: ${args.join(" ")}` });
    }, timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

test("daemon lifecycle commands install, migrate, report status, and read logs", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-life-"));
  const plistPath = join(dataDir, "com.klemm.daemon.plist");
  const logPath = join(dataDir, "klemm.log");
  const pidPath = join(dataDir, "klemm.pid");
  const env = { KLEMM_DATA_DIR: dataDir };

  const installed = await runKlemm(["daemon", "install", "--output", plistPath, "--data-dir", dataDir, "--program", process.execPath], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Daemon installed:/);
  const plist = await readFile(plistPath, "utf8");
  assert.match(plist, /StandardOutPath/);
  assert.match(plist, /klemm-daemon\.log/);

  const migrated = await runKlemm(["daemon", "migrate"], { env });
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.match(migrated.stdout, /Schema version: 2/);

  await writeFile(logPath, "alpha\nbeta\ngamma\n", "utf8");
  await writeFile(pidPath, "999999\n", "utf8");
  const status = await runKlemm(["daemon", "status", "--pid-file", pidPath, "--log-file", logPath], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Daemon process:/);
  assert.match(status.stdout, /Log file:/);

  const logs = await runKlemm(["daemon", "logs", "--log-file", logPath, "--tail", "2"], { env });
  assert.equal(logs.status, 0, logs.stderr);
  assert.doesNotMatch(logs.stdout, /alpha/);
  assert.match(logs.stdout, /beta/);
  assert.match(logs.stdout, /gamma/);
});

test("context sync jobs import changed sources once and expose sync status", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-sync-"));
  const sourceFile = join(dataDir, "codex.jsonl");
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(sourceFile, JSON.stringify({ session_id: "sync-1", role: "user", message: "I prefer terminal-first synced context." }), "utf8");

  const added = await runKlemm(["sync", "add", "--id", "codex-history", "--provider", "codex", "--path", sourceFile], { env });
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /Sync source added: codex-history/);

  const firstRun = await runKlemm(["sync", "run"], { env });
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.match(firstRun.stdout, /Imported: 1/);

  const secondRun = await runKlemm(["sync", "run"], { env });
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.match(secondRun.stdout, /Skipped unchanged: 1/);

  const status = await runKlemm(["sync", "status"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /codex-history codex/);
  assert.match(status.stdout, /lastImported=/);
});

test("TUI supports focused views and interactive tab switching", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-tui-v2-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["codex", "hub", "--id", "mission-tui-v2", "--goal", "Operate richer TUI"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--text", "I prefer terminal-first interfaces."], { env });
  await runKlemm(["policy", "add", "--id", "policy-tui-prod", "--name", "Production review", "--action-types", "deployment", "--target-includes", "prod"], { env });

  const memoryView = await runKlemm(["tui", "--view", "memory"], { env });
  assert.equal(memoryView.status, 0, memoryView.stderr);
  assert.match(memoryView.stdout, /Klemm TUI/);
  assert.match(memoryView.stdout, /Memory Review/);
  assert.match(memoryView.stdout, /terminal-first/);

  const interactive = await runKlemm(["tui", "--interactive"], { env, input: "tab policies\nmodel\nquit\n" });
  assert.equal(interactive.status, 0, interactive.stderr);
  assert.match(interactive.stdout, /Policies/);
  assert.match(interactive.stdout, /Klemm user model/);
});

test("supervise live interception kills risky streamed agent output and queues authority", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-live-intercept-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-live", "--hub", "codex", "--goal", "Stop risky streamed actions"], { env });

  const result = await runKlemm([
    "supervise",
    "--mission",
    "mission-live",
    "--intercept-output",
    "--",
    "node",
    "-e",
    "console.log(Buffer.from('cGxhbm5pbmcgZ2l0IHB1c2ggb3JpZ2luIG1haW4=', 'base64').toString()); setTimeout(()=>console.log('too late'), 500)",
  ], { env });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Klemm live intervention: queue/);
  assert.doesNotMatch(result.stdout, /too late/);

  const queue = await runKlemm(["queue"], { env });
  assert.equal(queue.status, 0, queue.stderr);
  assert.match(queue.stdout, /live-output/);
  assert.match(queue.stdout, /git_push/);
});

test("Codex installer writes skill, MCP config, wrapper, and context includes user model plus sync state", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-install-"));
  const installDir = join(dataDir, "codex");
  const sourceFile = join(dataDir, "codex.jsonl");
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(sourceFile, JSON.stringify({ session_id: "ctx", role: "user", message: "I love ambitious agentic infrastructure." }), "utf8");
  await runKlemm(["codex", "hub", "--id", "mission-codex-install", "--goal", "Install Klemm for Codex"], { env });
  await runKlemm(["sync", "add", "--id", "codex-source", "--provider", "codex", "--path", sourceFile], { env });
  await runKlemm(["sync", "run"], { env });

  const installed = await runKlemm(["codex", "install", "--output-dir", installDir, "--data-dir", dataDir], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Codex integration installed:/);
  assert.match(await readFile(join(installDir, "skills", "klemm", "SKILL.md"), "utf8"), /klemm codex context/);
  assert.match(await readFile(join(installDir, "mcp.json"), "utf8"), /klemm-mcp-server/);
  assert.match(await readFile(join(installDir, "bin", "klemm-codex"), "utf8"), /codex run/);

  const context = await runKlemm(["codex", "context", "--mission", "mission-codex-install"], { env });
  assert.equal(context.status, 0, context.stderr);
  const packet = JSON.parse(context.stdout);
  assert.match(packet.userModelSummary.text, /agentic infrastructure/);
  assert.equal(packet.contextSync.sources[0].id, "codex-source");
});
