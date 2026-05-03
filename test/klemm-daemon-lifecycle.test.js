import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createInitialKlemmState } from "../src/klemm.js";
import { createKlemmHttpServer } from "../src/klemm-daemon.js";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("daemon health endpoint and CLI probe expose lifecycle status", async () => {
  let state = createInitialKlemmState({ now: "2026-05-03T12:00:00.000Z" });
  const server = createKlemmHttpServer({
    getState: () => state,
    saveState: (next) => {
      state = next;
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${url}/api/health`);
    const health = await response.json();

    assert.equal(response.status, 200);
    assert.equal(health.status, "ok");
    assert.equal(health.version, 1);
    assert.equal(typeof health.uptimeMs, "number");

    const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-"));
    const cli = await runKlemm(["daemon", "health", "--url", url], { env: { KLEMM_DATA_DIR: dataDir } });

    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /Daemon health: ok/);
    assert.match(cli.stdout, /Version: 1/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("daemon foreground lifecycle writes a pid file and exposes pid status", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-"));
  const pidFile = join(dataDir, "klemm.pid");
  const child = spawn(process.execPath, ["--no-warnings", CLI_PATH, "daemon", "--host", "127.0.0.1", "--port", "0", "--pid-file", pidFile], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KLEMM_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });

  try {
    await waitFor(() => stdout.includes("Klemm daemon listening"));
    const pid = Number(await readFile(pidFile, "utf8"));
    assert.equal(pid, child.pid);

    const status = await runKlemm(["daemon", "status", "--pid-file", pidFile], { env: { KLEMM_DATA_DIR: dataDir } });
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /Daemon process: running/);
    assert.match(status.stdout, new RegExp(`PID: ${child.pid}`));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
  }
});

async function waitFor(fn, { timeoutMs = 2000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}
