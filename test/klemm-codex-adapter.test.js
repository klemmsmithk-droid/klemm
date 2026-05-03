import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
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

test("codex adapter commands expose context, event, and debrief packets", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const hub = await runKlemm(["codex", "hub", "--id", "mission-codex-adapter", "--goal", "Dogfood adapter packets"], {
    env,
  });
  assert.equal(hub.status, 0, hub.stderr);

  const event = await runKlemm(
    [
      "codex",
      "event",
      "--mission",
      "mission-codex-adapter",
      "--type",
      "command_planned",
      "--summary",
      "Codex plans focused adapter tests",
      "--action-id",
      "decision-adapter-tests",
      "--action-type",
      "command",
      "--target",
      "npm test -- test/klemm-codex-adapter.test.js",
    ],
    { env },
  );
  assert.equal(event.status, 0, event.stderr);
  assert.match(event.stdout, /Codex event recorded/);
  assert.match(event.stdout, /Decision: allow/);

  const context = await runKlemm(["codex", "context", "--mission", "mission-codex-adapter"], { env });
  assert.equal(context.status, 0, context.stderr);
  const packet = JSON.parse(context.stdout);
  assert.equal(packet.mission.id, "mission-codex-adapter");
  assert.equal(packet.hubAgent.id, "agent-codex");
  assert.equal(packet.queue.length, 0);
  assert.equal(packet.recentEvents[0].id, "event-codex-decision-adapter-tests");

  const debrief = await runKlemm(["codex", "debrief", "--mission", "mission-codex-adapter"], { env });
  assert.equal(debrief.status, 0, debrief.stderr);
  assert.match(debrief.stdout, /Codex debrief packet/);
  assert.match(debrief.stdout, /Dogfood adapter packets/);
  assert.match(debrief.stdout, /decision-adapter-tests/);
});
