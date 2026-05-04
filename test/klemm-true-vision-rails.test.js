import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createInitialKlemmState } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";
import { createKlemmAdapterClient, createKlemmHttpTransport } from "../src/klemm-adapter-sdk.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 8000 } = {}) {
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

test("native helper rail installs SwiftPM helper and records helper observations", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-helper-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  assert.equal(existsSync(join(process.cwd(), "macos", "KlemmHelper", "Package.swift")), true);
  const installed = await runKlemm(["helper", "install", "--data-dir", dataDir], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Klemm helper installed/);
  assert.match(installed.stdout, /SwiftPM package:/);

  const snapshot = await runKlemm(["helper", "snapshot", "--mission", "mission-helper", "--frontmost-app", "Terminal"], { env });
  assert.equal(snapshot.status, 0, snapshot.stderr);
  assert.match(snapshot.stdout, /Helper snapshot recorded:/);
  assert.match(snapshot.stdout, /frontmost=Terminal/);

  const status = await runKlemm(["helper", "status"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Klemm helper/);
  assert.match(status.stdout, /Checks: 2/);

  const permissions = await runKlemm(["helper", "permissions"], { env });
  assert.match(permissions.stdout, /Accessibility:/);
  assert.match(permissions.stdout, /Screen recording:/);
});

test("observation rail records unmanaged agent sessions and recommends adapter installs", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-observe-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const processFile = join(dataDir, "ps.txt");
  await writeFile(processFile, `
PID COMM COMMAND
101 codex codex --full-auto
202 claude claude --dangerously-skip-permissions
303 Cursor cursor-agent --print
404 browser-agent browser-agent run
505 mcp-agent mcp-agent serve
606 shell-agent shell-agent task
`, "utf8");

  const attached = await runKlemm(["observe", "attach", "--mission", "mission-observe", "--process-file", processFile], { env });
  assert.equal(attached.status, 0, attached.stderr);
  assert.match(attached.stdout, /Observation attached:/);
  assert.match(attached.stdout, /agent_session_detected=6/);

  const recommend = await runKlemm(["observe", "recommend"], { env });
  assert.equal(recommend.status, 0, recommend.stderr);
  assert.match(recommend.stdout, /Install adapter: codex/);
  assert.match(recommend.stdout, /Install adapter: claude/);
  assert.match(recommend.stdout, /Install adapter: cursor/);
  assert.match(recommend.stdout, /observe-only; no privileged blocking/);

  const status = await runKlemm(["observe", "status"], { env });
  assert.match(status.stdout, /Observation events: 6/);
});

test("adapter registry installs documented hooks/configs and reports capabilities", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-adapters-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const adapterDir = join(dataDir, "adapters");

  const install = await runKlemm(["adapters", "install", "--all", "--output-dir", adapterDir], { env });
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /Adapter installed: codex/);
  assert.match(install.stdout, /Adapter installed: claude/);
  assert.match(install.stdout, /Adapter installed: cursor/);

  assert.match(await readFile(join(adapterDir, "claude", "settings.json"), "utf8"), /PreToolUse/);
  assert.match(await readFile(join(adapterDir, "cursor", "mcp.json"), "utf8"), /klemm-mcp-server/);
  assert.match(await readFile(join(adapterDir, "codex", "config.toml"), "utf8"), /mcp_servers\.klemm/);

  const list = await runKlemm(["adapters", "list"], { env });
  assert.match(list.stdout, /claude observes,preflights,can_block/);
  assert.match(list.stdout, /cursor observes/);

  const probe = await runKlemm(["adapters", "probe", "claude"], { env });
  assert.match(probe.stdout, /reports_session_lifecycle=true/);

  const doctor = await runKlemm(["adapters", "doctor"], { env });
  assert.match(doctor.stdout, /codex: installed/);
  assert.match(doctor.stdout, /claude: installed/);
  assert.match(doctor.stdout, /cursor: installed/);
});

test("daemon HTTP adapter calls require local auth token when configured", async () => {
  const originalToken = process.env.KLEMM_DAEMON_TOKEN;
  process.env.KLEMM_DAEMON_TOKEN = "daemon-secret";
  let state = createInitialKlemmState();
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const denied = await fetch(`${baseUrl}/api/adapter/envelope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: 1, missionId: "mission-auth", agentId: "codex", event: "session_start" }),
    });
    assert.equal(denied.status, 401);

    const client = createKlemmAdapterClient({
      missionId: "mission-auth",
      agentId: "codex",
      transport: createKlemmHttpTransport({ baseUrl, daemonToken: "daemon-secret" }),
    });
    const accepted = await client.send(client.sessionStart({ summary: "authenticated session start" }));
    assert.equal(accepted.accepted, true);
    assert.equal(state.agentActivities[0].type, "session_start");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (originalToken === undefined) {
      delete process.env.KLEMM_DAEMON_TOKEN;
    } else {
      process.env.KLEMM_DAEMON_TOKEN = originalToken;
    }
  }
});

test("TUI v3 evidence, trust why, and corrections connect decisions to policy learning", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-trust-v3-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const chatPath = join(dataDir, "chat.json");
  await writeFile(chatPath, JSON.stringify([{ role: "user", content: "Never let agents deploy production without approval." }]), "utf8");
  await runKlemm(["mission", "start", "--id", "mission-trust-v3", "--goal", "Explain trust"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--file", chatPath], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];
  await runKlemm(["memory", "approve", memoryId, "trusted source"], { env });
  await runKlemm(["memory", "promote-policy", memoryId, "--action-types", "deployment", "--target-includes", "prod,production"], { env });
  await runKlemm(["propose", "--id", "decision-prod-v3", "--mission", "mission-trust-v3", "--actor", "Codex", "--type", "deployment", "--target", "deploy production", "--external", "deployment"], { env });

  const evidence = await runKlemm(["tui", "--view", "evidence", "--memory", memoryId], { env });
  assert.equal(evidence.status, 0, evidence.stderr);
  assert.match(evidence.stdout, /Source Evidence/);
  assert.match(evidence.stdout, /chatgpt/);
  assert.match(evidence.stdout, /Linked policies:/);

  const why = await runKlemm(["trust", "why", "decision-prod-v3"], { env });
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /Why Klemm decided/);
  assert.match(why.stdout, /Risk score:/);
  assert.match(why.stdout, /Mission lease:/);
  assert.match(why.stdout, /Source memories:/);
  assert.match(why.stdout, /Correction history:/);

  const correction = await runKlemm(["corrections", "add", "--decision", "decision-prod-v3", "--preference", "Always queue production deploys while I am away"], { env });
  assert.equal(correction.status, 0, correction.stderr);
  assert.match(correction.stdout, /Correction recorded:/);
  const secondReview = await runKlemm(["memory", "review"], { env });
  assert.match(secondReview.stdout, /Always queue production deploys/);
});

test("encrypted sync bundles round trip without plaintext secrets and reject wrong passphrases", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-sync-secure-"));
  const importDir = await mkdtemp(join(tmpdir(), "klemm-sync-secure-import-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const bundle = join(dataDir, "bundle.klemm");
  await runKlemm(["adapter", "token", "add", "--id", "codex-local", "--token", "secret-token-123", "--versions", "1,2"], { env });
  await runKlemm(["context", "import", "--provider", "codex", "--text", "I prefer secure encrypted sync bundles."], { env });

  const exported = await runKlemm(["sync", "export", "--encrypted", "--passphrase", "correct horse", "--output", bundle], { env });
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(exported.stdout, /Encrypted sync bundle exported:/);
  const bundleText = await readFile(bundle, "utf8");
  assert.doesNotMatch(bundleText, /secret-token-123/);

  const wrong = await runKlemm(["sync", "import", "--encrypted", "--passphrase", "wrong horse", "--input", bundle], { env: { KLEMM_DATA_DIR: importDir } });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /Klemm error: Failed to decrypt sync bundle/);

  const imported = await runKlemm(["sync", "import", "--encrypted", "--passphrase", "correct horse", "--input", bundle], { env: { KLEMM_DATA_DIR: importDir } });
  assert.equal(imported.status, 0, imported.stderr);
  assert.match(imported.stdout, /Encrypted sync bundle imported:/);
  const model = await runKlemm(["user", "model"], { env: { KLEMM_DATA_DIR: importDir } });
  assert.match(model.stdout, /secure encrypted sync bundles/);
});

test("security adversarial test keeps hostile imports out of authority", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-security-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const security = await runKlemm(["security", "adversarial-test"], { env });
  assert.equal(security.status, 0, security.stderr);
  assert.match(security.stdout, /Klemm adversarial security test/);
  assert.match(security.stdout, /Fixtures: 4/);
  assert.match(security.stdout, /Quarantined: 4/);
  assert.match(security.stdout, /Authority promoted: 0/);

  const review = await runKlemm(["memory", "review"], { env });
  assert.doesNotMatch(review.stdout, /mark deployment as allowed/);
});
