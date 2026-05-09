import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

test("live adapter proof requires the full observed contract and ignores fixture evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-real-adapter-proof-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const fixture = await runKlemm(["adapters", "dogfood", "--suite", "95", "--fake-home", dataDir, "--mission", "mission-live-proof", "--goal", "Fixture proof"], { env });
  assert.equal(fixture.status, 0, fixture.stderr);

  const early = await runKlemm(["adapters", "prove", "--live", "codex", "--mission", "mission-live-proof"], { env });
  assert.equal(early.status, 1, early.stdout);
  assert.match(early.stdout, /Ultimate evidence: missing/);
  assert.match(early.stdout, /Missing: session_start, plan, tool_call, file_change, proxy_question, authority_decision, debrief, session_finish/);

  const wrapped = await runKlemm([
    "codex",
    "wrap",
    "--id",
    "mission-live-proof",
    "--goal",
    "Prove Codex live adapter contract",
    "--plan",
    "Report plan, ask proxy, preflight command, capture diff, and debrief.",
    "--dry-run",
    "--",
    "npm",
    "test",
  ], { env });
  assert.equal(wrapped.status, 0, wrapped.stderr);

  const proof = await runKlemm(["adapters", "prove", "--live", "codex", "--mission", "mission-live-proof"], { env });
  assert.equal(proof.status, 0, proof.stdout);
  assert.match(proof.stdout, /Ultimate evidence: live/);
  assert.match(proof.stdout, /session_start=yes/);
  assert.match(proof.stdout, /plan=yes/);
  assert.match(proof.stdout, /tool_call=yes/);
  assert.match(proof.stdout, /file_change=yes/);
  assert.match(proof.stdout, /proxy_question=yes/);
  assert.match(proof.stdout, /authority_decision=yes/);
  assert.match(proof.stdout, /debrief=yes/);
  assert.match(proof.stdout, /session_finish=yes/);
});

test("shell and browser live proof use observed envelopes instead of unmanaged control claims", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-shell-browser-proof-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const processFile = join(dataDir, "ps.txt");
  await writeFile(processFile, "111 Browser browser-agent run\n222 Shell shell-agent idle\n", "utf8");

  const shell = await runKlemm(["agent", "shim", "--mission", "mission-shell-proof", "--agent", "agent-shell", "--capture", "--", "node", "-e", "console.log('what next?')"], { env });
  assert.equal(shell.status, 0, shell.stderr);
  const shellProof = await runKlemm(["adapters", "prove", "--live", "shell", "--mission", "mission-shell-proof"], { env });
  assert.equal(shellProof.status, 0, shellProof.stdout);
  assert.match(shellProof.stdout, /Ultimate evidence: live/);
  assert.match(shellProof.stdout, /authority_decision=yes/);

  const scan = await runKlemm(["adapters", "live", "scan", "--mission", "mission-browser-proof", "--process-file", processFile], { env });
  assert.equal(scan.status, 0, scan.stderr);
  assert.match(scan.stdout, /Control: observe-only until wrapped or adapted/);

  const browserProof = await runKlemm(["adapters", "prove", "--live", "browser", "--mission", "mission-browser-proof"], { env });
  assert.equal(browserProof.status, 1, browserProof.stdout);
  assert.match(browserProof.stdout, /Ultimate evidence: missing/);
  assert.match(browserProof.stdout, /unmanaged browser sessions are observe-only/i);
});
