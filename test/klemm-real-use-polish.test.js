import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 20000 } = {}) {
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

test("Codex wrap defaults to quiet real-session capture with friction status", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-quiet-capture-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const wrapped = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-quiet-capture",
    "--goal",
    "Quietly capture a real Codex build",
    "--plan",
    "Keep supervision useful without slowing the agent down.",
    "--",
    "node",
    "-e",
    "console.log('quiet capture body')",
  ], { env });
  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.match(wrapped.stdout, /Quiet capture: on/);
  assert.match(wrapped.stdout, /Friction budget: low/);
  assert.match(wrapped.stdout, /Klemm is quietly watching/);

  const status = await runKlemm(["codex", "capture", "status", "--mission", "mission-quiet-capture"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Real Codex Session Capture/);
  assert.match(status.stdout, /quiet_watch=yes/);
  assert.match(status.stdout, /capture_mode=default/);
  assert.match(status.stdout, /friction=low/);
  assert.match(status.stdout, /supervised_runs=1/);
  assert.match(status.stdout, /contract_status=needs_proxy_or_diff/);
});

test("connector onboarding finds likely sources, previews import counts, and can apply setup", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-connector-onboarding-"));
  const home = join(dataDir, "home");
  const downloads = join(home, "Downloads");
  const codexDir = join(home, ".codex");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };
  await mkdir(downloads, { recursive: true });
  await mkdir(codexDir, { recursive: true });
  await writeFile(join(downloads, "chatgpt-export.json"), JSON.stringify([{ role: "user", content: "I prefer terminal-native Klemm workflows." }]), "utf8");
  await writeFile(join(downloads, "claude-export.json"), JSON.stringify([{ messages: [{ role: "user", content: "Never push without review." }] }]), "utf8");
  await writeFile(join(downloads, "gemini-export.json"), JSON.stringify({ conversations: [{ messages: [{ role: "user", text: "I care about source evidence." }] }] }), "utf8");
  await writeFile(join(codexDir, "history.jsonl"), JSON.stringify({ role: "user", content: "Dogfood Klemm by default." }), "utf8");

  const preview = await runKlemm(["connectors", "onboard", "--home", home, "--preview"], { env });
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Klemm connector onboarding/);
  assert.match(preview.stdout, /Found likely sources:/);
  assert.match(preview.stdout, /chatgpt .*records=1/);
  assert.match(preview.stdout, /claude .*records=1/);
  assert.match(preview.stdout, /codex .*records=1/);
  assert.match(preview.stdout, /gemini .*records=1/);
  assert.match(preview.stdout, /What gets imported: prompts, preferences, corrections, projects, and authority boundaries/);
  assert.match(preview.stdout, /Review required before authority: yes/);
  assert.match(preview.stdout, /Run with --apply to save these connectors/);

  const applied = await runKlemm(["connectors", "onboard", "--home", home, "--apply"], { env });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Connector onboarding applied/);
  const list = await runKlemm(["connectors", "list"], { env });
  assert.match(list.stdout, /chatgpt export ready/);
  assert.match(list.stdout, /codex local-log ready/);
});

test("memory review at scale groups, dedupes, previews sources, and bulk approves", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-memory-scale-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const exportPath = join(dataDir, "chatgpt-scale.json");
  const records = [];
  for (let index = 0; index < 18; index += 1) {
    records.push({ role: "user", content: index % 3 === 0 ? "I prefer terminal-first tools." : `Project Klemm agent supervision note ${index}.` });
  }
  records.push({ role: "user", content: "Always run focused tests before full verification." });
  records.push({ role: "user", content: "I prefer terminal-first tools." });
  await writeFile(exportPath, JSON.stringify(records), "utf8");
  await runKlemm(["context", "import", "--provider", "chatgpt", "--file", exportPath], { env });

  const review = await runKlemm(["memory", "review", "--bulk", "--group-by-class", "--source-preview", "--limit", "6"], { env });
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /Bulk Memory Review/);
  assert.match(review.stdout, /Pending total:/);
  assert.match(review.stdout, /Duplicate candidates skipped:/);
  assert.match(review.stdout, /Group: standing_preference/);
  assert.match(review.stdout, /Group: project_context/);
  assert.match(review.stdout, /Source Preview:/);
  assert.match(review.stdout, /Shortcuts: approve-by-class, reject-by-source, pin, promote/);

  const approved = await runKlemm(["memory", "bulk", "approve", "--class", "standing_preference", "--limit", "2", "--note", "scale review"], { env });
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(approved.stdout, /Bulk memory approved/);
  assert.match(approved.stdout, /Class: standing_preference/);
  assert.match(approved.stdout, /Count: 2/);
});

test("trust why v3 gives the crisp answer, exact evidence, uncertainty, and teach path", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-trust-v3-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  await runKlemm(["mission", "start", "--id", "mission-trust-v3", "--goal", "Use Klemm safely"], { env });
  await runKlemm(["context", "import", "--provider", "chatgpt", "--source-ref", "kyle-history", "--text", "Never deploy production without explicit approval.\nI want exact source evidence for Klemm decisions."], { env });
  const review = await runKlemm(["memory", "review"], { env });
  const memoryId = review.stdout.match(/- (memory-[^ ]+)/)?.[1];
  assert.ok(memoryId, review.stdout);
  await runKlemm(["memory", "approve", memoryId, "trusted Kyle history"], { env });
  await runKlemm(["memory", "promote-policy", memoryId, "--action-types", "deployment", "--target-includes", "production"], { env });
  const proposed = await runKlemm(["propose", "--mission", "mission-trust-v3", "--actor", "agent-codex", "--type", "deployment", "--target", "deploy production"], { env });
  const decisionId = proposed.stdout.match(/Decision ID: (decision-[^\n]+)/)?.[1];
  assert.ok(decisionId, proposed.stdout);

  const why = await runKlemm(["trust", "why", decisionId, "--v3"], { env });
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /Trust UX v3/);
  assert.match(why.stdout, /Answer first: Queue this action/);
  assert.match(why.stdout, /Why this is in Kyle's best interest:/);
  assert.match(why.stdout, /Exact evidence:/);
  assert.match(why.stdout, /Uncertainty: low/);
  assert.match(why.stdout, /Teach Klemm:/);
  assert.match(why.stdout, new RegExp(`klemm corrections add --decision ${decisionId}`));
});

test("helper stream tick updates live state, session changes, stale warnings, and wrap recommendations", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-helper-loop-"));
  const firstPs = join(dataDir, "ps-first.txt");
  const secondPs = join(dataDir, "ps-second.txt");
  const env = { KLEMM_DATA_DIR: dataDir };
  await writeFile(firstPs, "101 Codex codex --ask-for-approval on-request\n", "utf8");
  await writeFile(secondPs, [
    "101 Codex codex --ask-for-approval on-request",
    "202 Claude claude --dangerously-skip-permissions",
  ].join("\n"), "utf8");

  await runKlemm(["helper", "stream", "start", "--mission", "mission-helper-loop", "--process-file", firstPs, "--frontmost-app", "Codex", "--watch-path", "src"], { env });
  const tick = await runKlemm(["helper", "stream", "tick", "--mission", "mission-helper-loop", "--process-file", secondPs, "--frontmost-app", "Claude", "--watch-path", "src"], { env });
  assert.equal(tick.status, 0, tick.stderr);
  assert.match(tick.stdout, /Helper stream tick/);
  assert.match(tick.stdout, /Session changes: 1 new unmanaged agent/);
  assert.match(tick.stdout, /Heartbeat: recorded/);

  const status = await runKlemm(["helper", "stream", "status", "--mission", "mission-helper-loop", "--stale-after-ms", "0"], { env });
  assert.match(status.stdout, /health=stale/);
  assert.match(status.stdout, /Live session recommendations:/);
  assert.match(status.stdout, /Wrap with: klemm run codex/);
  assert.match(status.stdout, /Install adapter: claude/);
  assert.match(status.stdout, /Recommendation: restart helper stream or check helper permissions/);
});
