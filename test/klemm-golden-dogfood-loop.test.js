import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 20000 } = {}) {
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

test("golden dogfood loop refuses completion until real plan, command, diff, proxy, queue, and debrief evidence exist", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-golden-loop-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const started = await runKlemm([
    "dogfood",
    "golden",
    "start",
    "--id",
    "mission-golden-loop",
    "--goal",
    "Build Klemm with Klemm watching",
    "--plan",
    "Capture actual evidence before finish.",
    "--",
    "node",
    "-e",
    "console.log('real golden command')",
  ], { env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /Klemm golden dogfood started/);
  assert.match(started.stdout, /real golden command/);

  const incomplete = await runKlemm(["dogfood", "golden", "finish", "--mission", "mission-golden-loop"], { env });
  assert.equal(incomplete.status, 2, incomplete.stdout);
  assert.match(incomplete.stdout, /Golden dogfood finish blocked/);
  assert.match(incomplete.stdout, /diff_reports=missing/);
  assert.match(incomplete.stdout, /proxy_questions=missing/);
  assert.match(incomplete.stdout, /queue_decisions=missing/);

  await runKlemm(["memory", "seed-proxy", "--id", "memory-golden-proceed", "--text", "Kyle uses proceed to continue safe local implementation work after tests."], { env });
  await runKlemm(["proxy", "ask", "--goal", "mission-golden-loop", "--agent", "agent-codex", "--question", "Should I continue the implementation?", "--context", "Focused verification passed."], { env });
  await runKlemm(["codex", "report", "--mission", "mission-golden-loop", "--type", "diff", "--summary", "Golden loop diff captured", "--file", "src/klemm-cli.js"], { env });
  await runKlemm(["propose", "--id", "decision-golden-push", "--mission", "mission-golden-loop", "--actor", "agent-codex", "--type", "git_push", "--target", "origin main", "--external", "git_push"], { env });
  await runKlemm(["codex", "report", "--mission", "mission-golden-loop", "--type", "debrief", "--summary", "Golden loop debrief captured"], { env });

  const status = await runKlemm(["dogfood", "golden", "status", "--mission", "mission-golden-loop"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Golden Dogfood Loop/);
  assert.match(status.stdout, /plan_reports=present/);
  assert.match(status.stdout, /command_capture=present/);
  assert.match(status.stdout, /diff_reports=present/);
  assert.match(status.stdout, /proxy_questions=present/);
  assert.match(status.stdout, /queue_decisions=present/);
  assert.match(status.stdout, /debriefs=present/);
  assert.match(status.stdout, /Verdict: pass/);
  assert.match(status.stdout, /Timeline:/);
  assert.match(status.stdout, /real golden command/);
  assert.match(status.stdout, /decision-golden-push/);

  const blockedByQueue = await runKlemm(["dogfood", "golden", "finish", "--mission", "mission-golden-loop"], { env });
  assert.equal(blockedByQueue.status, 2, blockedByQueue.stdout);
  assert.match(blockedByQueue.stdout, /unresolved_queue=1/);

  await runKlemm(["queue", "deny", "decision-golden-push", "No push during golden dogfood proof."], { env });
  const finished = await runKlemm(["dogfood", "golden", "finish", "--mission", "mission-golden-loop"], { env });
  assert.equal(finished.status, 0, finished.stderr);
  assert.match(finished.stdout, /Golden dogfood debrief/);
  assert.match(finished.stdout, /Mission finished: mission-golden-loop/);
  assert.match(finished.stdout, /Live state: clean/);
});

test("real adapter installers write auditable public-surface configs, report doctor guidance, and restore backups", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-real-adapters-"));
  const home = join(dataDir, "home");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(join(home, ".codex", "config.toml"), "# existing codex config\n", "utf8");

  const installed = await runKlemm(["adapters", "install", "--real", "--all", "--home", home], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Adapter installed: codex real/);
  assert.match(installed.stdout, /Adapter installed: claude real/);
  assert.match(installed.stdout, /Adapter installed: cursor real/);
  assert.match(installed.stdout, /Adapter installed: shell real/);
  assert.match(installed.stdout, /Backup:/);

  const codexConfig = await readFile(join(home, ".codex", "config.toml"), "utf8");
  assert.match(codexConfig, /mcp_servers\.klemm/);
  assert.match(codexConfig, /default_tools_approval_mode = "prompt"/);
  const claudeSettings = await readFile(join(home, ".claude", "settings.json"), "utf8");
  assert.match(claudeSettings, /SessionStart/);
  assert.match(claudeSettings, /PreToolUse/);
  assert.match(claudeSettings, /PostToolUse/);
  assert.match(claudeSettings, /SessionEnd/);
  const cursorRules = await readFile(join(home, ".cursor", "rules", "klemm.mdc"), "utf8");
  assert.match(cursorRules, /proxy_ask/);
  assert.match(cursorRules, /record_adapter_envelope/);

  const doctor = await runKlemm(["adapters", "doctor", "--live", "--home", home], { env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /codex: installed/);
  assert.match(doctor.stdout, /claude: installed/);
  assert.match(doctor.stdout, /cursor: installed/);
  assert.match(doctor.stdout, /shell: installed/);
  assert.match(doctor.stdout, /uninstall=klemm adapters uninstall codex/);
  assert.match(doctor.stdout, /capabilities=observes,preflights,can_block,captures_output,reports_diff,reports_session_lifecycle/);

  const uninstalled = await runKlemm(["adapters", "uninstall", "codex", "--home", home], { env });
  assert.equal(uninstalled.status, 0, uninstalled.stderr);
  assert.match(uninstalled.stdout, /Adapter uninstalled: codex/);
  assert.equal(await readFile(join(home, ".codex", "config.toml"), "utf8"), "# existing codex config\n");
});
