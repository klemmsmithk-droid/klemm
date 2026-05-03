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

test("klemm CLI starts a mission, registers Codex, queues risky actions, and debriefs", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-cli-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const mission = await runKlemm(
    [
      "mission",
      "start",
      "--id",
      "mission-codex",
      "--hub",
      "codex",
      "--goal",
      "Build Klemm while Kyle is AFK",
      "--allow",
      "read_files,edit_local_code,run_tests",
      "--block",
      "git_push,external_send,credential_change",
      "--rewrite",
    ],
    { env },
  );
  assert.equal(mission.status, 0, mission.stderr);
  assert.match(mission.stdout, /Mission started: mission-codex/);
  assert.match(mission.stdout, /Hub: codex/);

  const agent = await runKlemm(
    ["agent", "register", "--id", "agent-codex", "--mission", "mission-codex", "--name", "Codex", "--kind", "coding_agent"],
    { env },
  );
  assert.equal(agent.status, 0, agent.stderr);
  assert.match(agent.stdout, /Agent registered: agent-codex/);

  const proposal = await runKlemm(
    [
      "propose",
      "--id",
      "decision-push",
      "--mission",
      "mission-codex",
      "--actor",
      "Codex",
      "--type",
      "git_push",
      "--target",
      "origin main",
      "--external",
      "publishes_code",
    ],
    { env },
  );
  assert.equal(proposal.status, 0, proposal.stderr);
  assert.match(proposal.stdout, /Decision: queue/);
  assert.match(proposal.stdout, /Risk: high/);

  const queue = await runKlemm(["queue"], { env });
  assert.equal(queue.status, 0, queue.stderr);
  assert.match(queue.stdout, /decision-push/);
  assert.match(queue.stdout, /origin main/);

  const denied = await runKlemm(["deny", "decision-push", "Review before publishing"], { env });
  assert.equal(denied.status, 0, denied.stderr);
  assert.match(denied.stdout, /Decision recorded: denied/);

  const debrief = await runKlemm(["debrief", "--mission", "mission-codex"], { env });
  assert.equal(debrief.status, 0, debrief.stderr);
  assert.match(debrief.stdout, /Build Klemm while Kyle is AFK/);
  assert.match(debrief.stdout, /Denied: 1/);
});

test("klemm supervise blocks high-risk commands before process launch", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-cli-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const mission = await runKlemm(["mission", "start", "--id", "mission-shell", "--hub", "terminal", "--goal", "Supervise shell work"], {
    env,
  });
  assert.equal(mission.status, 0, mission.stderr);

  const blocked = await runKlemm(["supervise", "--mission", "mission-shell", "--", "rm", "-rf", "/tmp/klemm-danger"], {
    env,
  });

  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /Klemm blocked command before launch/);
  assert.match(blocked.stdout, /Decision: queue/);

  const allowed = await runKlemm(["supervise", "--mission", "mission-shell", "--", "node", "-e", "console.log('klemm-ok')"], {
    env,
  });

  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /klemm-ok/);
  assert.match(allowed.stdout, /Klemm supervised exit: 0/);
});

test("klemm supervise executes safe Klemm rewrites instead of the original command", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-cli-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const mission = await runKlemm(["mission", "start", "--id", "mission-rewrite", "--hub", "terminal", "--goal", "Narrow broad commands"], {
    env,
  });
  assert.equal(mission.status, 0, mission.stderr);

  const result = await runKlemm(
    [
      "supervise",
      "--mission",
      "mission-rewrite",
      "--rewrite-to",
      "node -e console.log('klemm-rewritten')",
      "--",
      "node",
      "-e",
      "console.log('original-command')",
    ],
    { env },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Klemm rewrote command/);
  assert.match(result.stdout, /klemm-rewritten/);
  assert.doesNotMatch(result.stdout, /original-command/);
});

test("klemm CLI starts Codex hub, records events, ingests exports, and renders TUI dashboard", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-cli-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const hub = await runKlemm(["codex", "hub", "--id", "mission-codex-v1", "--goal", "Dogfood Codex supervision"], {
    env,
  });
  assert.equal(hub.status, 0, hub.stderr);
  assert.match(hub.stdout, /Codex hub mission started: mission-codex-v1/);

  const event = await runKlemm(
    [
      "event",
      "record",
      "--id",
      "event-push",
      "--mission",
      "mission-codex-v1",
      "--agent",
      "agent-codex",
      "--type",
      "external_action_requested",
      "--summary",
      "Codex wants to push",
      "--action-id",
      "decision-push",
      "--action-type",
      "git_push",
      "--target",
      "origin main",
      "--external",
      "publishes_code",
    ],
    { env },
  );
  assert.equal(event.status, 0, event.stderr);
  assert.match(event.stdout, /Event recorded: event-push/);
  assert.match(event.stdout, /Decision: queue/);

  const memory = await runKlemm(
    [
      "memory",
      "ingest-export",
      "--source",
      "chatgpt_export",
      "--text",
      JSON.stringify([{ role: "user", content: "I prefer terminal-first tools. Do not let agents push without approval." }]),
    ],
    { env },
  );
  assert.equal(memory.status, 0, memory.stderr);
  assert.match(memory.stdout, /Messages: 1/);
  assert.match(memory.stdout, /Distilled:/);

  const tui = await runKlemm(["tui", "--mission", "mission-codex-v1"], { env });
  assert.equal(tui.status, 0, tui.stderr);
  assert.match(tui.stdout, /Mission: Dogfood Codex supervision/);
  assert.match(tui.stdout, /Queue: 1 unresolved/);
  assert.match(tui.stdout, /Recent interventions/);
});
