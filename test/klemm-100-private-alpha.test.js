import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 8000 } = {}) {
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

test("readiness scores a complete terminal-native private-alpha loop at 100 percent", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-ready-"));
  const home = join(dataDir, "home");
  await mkdir(home, { recursive: true });
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  const chatPath = join(dataDir, "chatgpt.json");
  await writeFile(chatPath, JSON.stringify([{ role: "user", content: "Never let agents deploy production without approval." }]), "utf8");

  await runKlemm(["install", "--data-dir", dataDir, "--policy-pack", "coding-afk", "--agents", "codex,claude,shell"], { env });
  await mkdir(join(dataDir, "logs"), { recursive: true });
  await writeFile(join(dataDir, "logs", "klemm-daemon.log"), "Klemm daemon listening\n", "utf8");
  await runKlemm(["context", "import", "--provider", "chatgpt", "--file", chatPath], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/memory-\d+-\d+/)[0];
  await runKlemm(["memory", "approve", memoryId, "reviewed authority boundary"], { env });
  await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-ready",
    "--goal",
    "Exercise full private-alpha loop",
    "--plan",
    "Run a safe supervised command and finish.",
    "--finish",
    "--",
    "node",
    "-e",
    "console.log('ready-loop-ok')",
  ], { env });

  const readiness = await runKlemm(["readiness", "--data-dir", dataDir, "--skip-health"], { env });
  assert.equal(readiness.status, 0, readiness.stderr);
  assert.match(readiness.stdout, /Klemm private-alpha readiness/);
  assert.match(readiness.stdout, /Score: 100%/);
  assert.match(readiness.stdout, /Ship gate: pass/);
  assert.match(readiness.stdout, /install_artifacts: pass/);
  assert.match(readiness.stdout, /codex_wrapper: pass/);
  assert.match(readiness.stdout, /mcp_config: pass/);
  assert.match(readiness.stdout, /policy_pack: pass/);
  assert.match(readiness.stdout, /supervised_session: pass/);
  assert.match(readiness.stdout, /memory_review: pass/);
  assert.match(readiness.stdout, /queue_clean: pass/);
  assert.match(readiness.stdout, /mission_clean: pass/);
  assert.match(readiness.stdout, /doctor: pass/);
});

test("readiness explains missing private-alpha gates and exits nonzero", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-not-ready-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const readiness = await runKlemm(["readiness", "--data-dir", dataDir, "--skip-health"], { env });

  assert.equal(readiness.status, 1, readiness.stderr);
  assert.match(readiness.stdout, /Klemm private-alpha readiness/);
  assert.match(readiness.stdout, /Ship gate: fail/);
  assert.match(readiness.stdout, /install_artifacts: fail/);
  assert.match(readiness.stdout, /codex_wrapper: fail/);
  assert.match(readiness.stdout, /Next actions:/);
  assert.match(readiness.stdout, /klemm install --data-dir/);
});

test("dogfood finish refuses unresolved queue and then closes a clean mission", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-dogfood-finish-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-finish", "--hub", "codex", "--goal", "Close dogfood safely"], { env });
  await runKlemm(["propose", "--id", "decision-finish-push", "--mission", "mission-finish", "--actor", "Codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });

  const blocked = await runKlemm(["dogfood", "finish", "--mission", "mission-finish", "--note", "done"], { env });
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stdout, /Dogfood finish blocked/);
  assert.match(blocked.stdout, /Unresolved queue: 1/);
  assert.match(blocked.stdout, /klemm queue inspect decision-finish-push/);

  await runKlemm(["queue", "deny", "decision-finish-push", "not part of dogfood closeout"], { env });
  const finished = await runKlemm(["dogfood", "finish", "--mission", "mission-finish", "--note", "dogfood complete"], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /Klemm debrief/);
  assert.match(finished.stdout, /Mission finished: mission-finish/);
  assert.match(finished.stdout, /Live state: clean/);

  const current = await runKlemm(["mission", "current"], { env });
  assert.match(current.stdout, /No active mission/);
});
