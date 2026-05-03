import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "" } = {}) {
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
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("interactive TUI can deny queued decisions and approve memory candidates", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-tui-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  assert.equal((await runKlemm(["codex", "hub", "--id", "mission-tui", "--goal", "Operate TUI"], { env })).status, 0);
  assert.equal(
    (
      await runKlemm(
        [
          "event",
          "record",
          "--id",
          "event-push",
          "--mission",
          "mission-tui",
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
      )
    ).status,
    0,
  );
  assert.equal(
    (
      await runKlemm(
        ["memory", "ingest-export", "--source", "chatgpt_export", "--text", JSON.stringify([{ role: "user", content: "I prefer terminal-first tools." }])],
        { env },
      )
    ).status,
    0,
  );

  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/- (memory-[^\s]+)/)?.[1];
  assert.ok(memoryId);

  const tui = await runKlemm(["tui", "--interactive", "--mission", "mission-tui"], {
    env,
    input: `deny decision-push Review before publish\nmemory approve ${memoryId} durable preference\nquit\n`,
  });

  assert.equal(tui.status, 0, tui.stderr);
  assert.match(tui.stdout, /Interactive Klemm TUI/);
  assert.match(tui.stdout, /Decision recorded: denied/);
  assert.match(tui.stdout, new RegExp(`Memory reviewed: ${memoryId} approved`));
  assert.match(tui.stdout, /bye/);
});
