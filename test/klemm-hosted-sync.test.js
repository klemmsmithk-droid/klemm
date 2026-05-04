import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createHostedSyncService } from "../sync-service/klemm-sync-service.js";

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

test("hosted sync service exposes Vercel-ready encrypted push, pull, rotate, and health", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-hosted-sync-"));
  const serverDir = join(dataDir, "server");
  const env = { KLEMM_DATA_DIR: dataDir, KLEMM_SYNC_PASSPHRASE: "correct horse battery staple" };
  const service = createHostedSyncService({ storageDir: serverDir, token: "test-token" });

  const health = await service.handle({ method: "GET", url: "/api/v1/health", headers: {} });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);

  const init = await runKlemm(["sync", "hosted", "init", "--url", `file://${serverDir}`, "--token", "test-token"], { env });
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /Hosted sync configured/);
  assert.match(init.stdout, /token=\[REDACTED\]/);

  await runKlemm(["context", "import", "--provider", "chatgpt", "--source-ref", "sync-source", "--text", "Kyle wants source-backed memory."], { env });
  const pushed = await runKlemm(["sync", "hosted", "push", "--encrypted"], { env });
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.match(pushed.stdout, /Hosted encrypted sync push/);
  assert.match(pushed.stdout, /server_plaintext=no/);

  const stored = await readFile(join(serverDir, "bundles.jsonl"), "utf8");
  assert.doesNotMatch(stored, /Kyle wants source-backed memory/);

  const pulled = await runKlemm(["sync", "hosted", "pull", "--encrypted"], { env });
  assert.equal(pulled.status, 0, pulled.stderr);
  assert.match(pulled.stdout, /Hosted encrypted sync pull/);
  assert.match(pulled.stdout, /conflict=preserve_both_event_streams/);

  const status = await runKlemm(["sync", "hosted", "status"], { env });
  assert.match(status.stdout, /Klemm hosted sync/);
  assert.match(status.stdout, /url=file:\/\//);
  assert.match(status.stdout, /encrypted=yes/);

  const rotated = await runKlemm(["sync", "hosted", "rotate", "--token", "next-token"], { env });
  assert.match(rotated.stdout, /Hosted sync token rotated/);
  assert.match(rotated.stdout, /token=\[REDACTED\]/);
});
