import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 10000 } = {}) {
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

async function runSwiftHelper(args, { timeoutMs = 20000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn("swift", ["run", "--package-path", "macos/KlemmHelper", "klemm-helper", ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: 124, stdout, stderr: `${stderr}\nTimed out: swift helper` });
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

test("Swift helper v2 emits real observation shape and streams snapshots to daemon", async () => {
  const temp = await mkdtemp(join(tmpdir(), "klemm-helper-v2-"));
  const psFixture = join(temp, "ps.txt");
  await writeFile(psFixture, `
PID COMM COMMAND
101 codex codex --full-auto
202 zsh /bin/zsh
`, "utf8");

  const once = await runSwiftHelper(["--once", "--mission", "mission-helper-v2", "--frontmost-app", "Terminal", "--process-fixture", psFixture, "--watch-path", "src"]);
  assert.equal(once.status, 0, once.stderr);
  const snapshot = JSON.parse(once.stdout);
  assert.equal(snapshot.helper, "KlemmHelper");
  assert.equal(snapshot.missionId, "mission-helper-v2");
  assert.equal(snapshot.frontmostApp, "Terminal");
  assert.equal(snapshot.processes.some((process) => process.command.includes("codex")), true);
  assert.equal(snapshot.runningApps.some((app) => app.name === "Terminal"), true);
  assert.equal(snapshot.permissions.fileEvents, "available");
  assert.equal(snapshot.fileWatchMetadata.some((item) => item.path === "src"), true);
  assert.equal(snapshot.unmanagedAgentHints.some((hint) => hint.agentKind === "codex"), true);

  const received = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ url: request.url, body: JSON.parse(body) });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const stream = await runSwiftHelper([
      "--stream",
      "--count",
      "2",
      "--interval-ms",
      "10",
      "--mission",
      "mission-helper-v2",
      "--process-fixture",
      psFixture,
      "--daemon-url",
      `http://127.0.0.1:${port}`,
    ]);
    assert.equal(stream.status, 0, stream.stderr);
    assert.equal(received.length, 2);
    assert.equal(received[0].url, "/api/os/observations");
    assert.equal(received[0].body.missionId, "mission-helper-v2");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("real adapter installers write documented locations with backup, doctor, and uninstall", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapter-real-"));
  const home = join(dataDir, "home");
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(join(home, ".codex", "config.toml"), "existing = true\n", "utf8");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };

  const install = await runKlemm(["adapters", "install", "--real", "--all", "--home", home], { env });
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /Adapter installed: codex real/);
  assert.match(install.stdout, /Backup:/);
  assert.match(await readFile(join(home, ".codex", "config.toml"), "utf8"), /mcp_servers\.klemm/);
  assert.match(await readFile(join(home, ".claude", "settings.json"), "utf8"), /PreToolUse/);
  assert.match(await readFile(join(home, ".cursor", "mcp.json"), "utf8"), /klemm-mcp-server/);
  assert.match(await readFile(join(home, ".klemm", "shell", "klemm-shell-profile.sh"), "utf8"), /klemm supervise/);

  const doctor = await runKlemm(["adapters", "doctor", "--home", home], { env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /codex: installed real files=1 backups=1/);
  assert.match(doctor.stdout, /shell: installed real files=1 backups=0/);

  const uninstall = await runKlemm(["adapters", "uninstall", "codex", "--home", home], { env });
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.match(uninstall.stdout, /Adapter uninstalled: codex/);
  assert.equal(await readFile(join(home, ".codex", "config.toml"), "utf8"), "existing = true\n");
});

test("memory review TUI v3 groups inbox, previews evidence, searches, and supports interactive promote", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-memory-v3-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(join(dataDir, "chat.json"), JSON.stringify([{ role: "user", content: "Never deploy production without explicit approval." }]), "utf8");
  await writeFile(join(dataDir, "docs.txt"), "I prefer compact terminal-first tools with source evidence.", "utf8");
  await runKlemm(["context", "import", "--provider", "chatgpt", "--file", join(dataDir, "chat.json")], { env });
  await runKlemm(["context", "import", "--provider", "docs", "--file", join(dataDir, "docs.txt")], { env });

  const inbox = await runKlemm(["tui", "--view", "memory", "--search", "deploy", "--source-preview"], { env });
  assert.equal(inbox.status, 0, inbox.stderr);
  assert.match(inbox.stdout, /Memory Inbox/);
  assert.match(inbox.stdout, /Group: authority_boundaries/);
  assert.match(inbox.stdout, /Source Preview/);
  assert.match(inbox.stdout, /Why trusted\?/);
  assert.match(inbox.stdout, /Actions: approve, reject, pin, promote-to-policy/);
  assert.doesNotMatch(inbox.stdout, /terminal-first tools/);

  const memoryId = inbox.stdout.match(/memory-\d+-\d+/)[0];
  const interactive = await runKlemm(["tui", "--interactive"], {
    env,
    input: `memory approve ${memoryId} reviewed\nmemory promote ${memoryId} --action-types deployment --target-includes production\nquit\n`,
  });
  assert.equal(interactive.status, 0, interactive.stderr);
  assert.match(interactive.stdout, /Memory reviewed:/);
  assert.match(interactive.stdout, /Policy promoted:/);
});

test("trust why renders an audit-grade explanation with correction guidance", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-trust-polish-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-trust-polish", "--goal", "Audit decisions"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--text", "Never deploy production without explicit approval."], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];
  await runKlemm(["memory", "approve", memoryId, "reviewed"], { env });
  await runKlemm(["memory", "promote-policy", memoryId, "--action-types", "deployment", "--target-includes", "production"], { env });
  await runKlemm(["propose", "--id", "decision-trust-polish", "--mission", "mission-trust-polish", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment"], { env });
  await runKlemm(["corrections", "add", "--decision", "decision-trust-polish", "--preference", "Queue all prod deploys when I am away"], { env });

  const why = await runKlemm(["trust", "why", "decision-trust-polish"], { env });
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /Bottom line/);
  assert.match(why.stdout, /What Klemm saw/);
  assert.match(why.stdout, /Why this matches you/);
  assert.match(why.stdout, /Evidence trail/);
  assert.match(why.stdout, /Correction history/);
  assert.match(why.stdout, /How to correct Klemm/);
  assert.match(why.stdout, /Confidence:/);
});

test("daemon token lifecycle writes encrypted strict-permission token files and dogfood start uses codex wrap", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-secure-"));
  const tokenFile = join(dataDir, "daemon.token");
  const env = { KLEMM_DATA_DIR: dataDir };

  const generated = await runKlemm(["daemon", "token", "generate", "--output", tokenFile, "--passphrase", "pw"], { env });
  assert.equal(generated.status, 0, generated.stderr);
  assert.match(generated.stdout, /Daemon token generated:/);
  assert.doesNotMatch(await readFile(tokenFile, "utf8"), /klemm-daemon-/);

  const doctor = await runKlemm(["doctor", "--skip-health", "--token-file", tokenFile, "--token-passphrase", "pw"], { env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Token file: ok/);
  assert.match(doctor.stdout, /Token decrypt: ok/);
  assert.match(doctor.stdout, /Log redaction: ok/);

  await chmod(tokenFile, 0o644);
  const unsafe = await runKlemm(["doctor", "--skip-health", "--token-file", tokenFile, "--token-passphrase", "pw"], { env });
  assert.match(unsafe.stdout, /Token file: warning/);
  await chmod(tokenFile, 0o600);

  const rotated = await runKlemm(["daemon", "token", "rotate", "--output", tokenFile, "--passphrase", "pw"], { env });
  assert.equal(rotated.status, 0, rotated.stderr);
  assert.match(rotated.stdout, /Daemon token rotated:/);

  const dogfood = await runKlemm(["dogfood", "start", "--id", "mission-dogfood-default", "--goal", "Default wrapper", "--plan", "Use codex wrap", "--dry-run", "--", "node", "-e", "console.log('wrapped')"], { env });
  assert.equal(dogfood.status, 0, dogfood.stderr);
  assert.match(dogfood.stdout, /Klemm dogfood wrapper: codex wrap/);
  assert.match(dogfood.stdout, /Codex wrapper session started: mission-dogfood-default/);
  assert.match(dogfood.stdout, /Debrief reported: accepted/);
});
