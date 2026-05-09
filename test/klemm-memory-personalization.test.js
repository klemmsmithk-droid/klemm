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

test("memory personalize builds a Kyle-aware profile card from reviewed local sources", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-memory-personalize-"));
  const notesPath = join(dataDir, "kyle-notes.md");
  await writeFile(notesPath, [
    "Kyle says what next when he wants the next concrete implementation slice.",
    "Kyle says proceed to continue the already discussed safe local plan.",
    "No corners cut means focused tests, full tests, and a debrief.",
    "Klemm should stay terminal-native and queue pushes or deploys.",
  ].join("\n"), "utf8");
  const env = { KLEMM_DATA_DIR: dataDir };

  await runKlemm(["directions", "add", "--text", "Always use Klemm while building Klemm and keep risky external actions queued."], { env });
  const personalize = await runKlemm([
    "memory",
    "personalize",
    "--source",
    "directions",
    "--source",
    "docs",
    "--file",
    notesPath,
    "--review-required",
  ], { env });
  assert.equal(personalize.status, 0, personalize.stderr);
  assert.match(personalize.stdout, /Klemm memory personalize/);
  assert.match(personalize.stdout, /Pending profile memories:/);
  assert.match(personalize.stdout, /Raw imports remain non-authority until reviewed or pinned/);

  const deck = await runKlemm(["memory", "workbench", "deck", "--source-preview", "--why-trusted", "--limit", "20"], { env });
  assert.equal(deck.status, 0, deck.stderr);
  assert.match(deck.stdout, /Group: prompt_intent/);
  assert.match(deck.stdout, /Group: authority_boundaries/);
  assert.match(deck.stdout, /Dedupe hint:/);
  assert.match(deck.stdout, /Why trusted: pending review; not authority until approved or pinned/);

  const approve = await runKlemm(["memory", "bulk", "approve", "--class", "prompt_intent", "--limit", "10", "--note", "Kyle prompt intent reviewed"], { env });
  assert.equal(approve.status, 0, approve.stderr);
  const pin = await runKlemm(["memory", "bulk", "approve", "--class", "authority_boundaries", "--limit", "10", "--note", "Kyle authority boundary reviewed"], { env });
  assert.equal(pin.status, 0, pin.stderr);

  const profile = await runKlemm(["user", "profile", "--card", "--evidence"], { env });
  assert.equal(profile.status, 0, profile.stderr);
  assert.match(profile.stdout, /Kyle Profile Card/);
  assert.match(profile.stdout, /what'?s next.*implementation slice/i);
  assert.match(profile.stdout, /proceed.*safe local plan/i);
  assert.match(profile.stdout, /no corners cut.*tests/i);
  assert.match(profile.stdout, /terminal-native/i);
  assert.match(profile.stdout, /push.*deploy.*queue/i);
  assert.match(profile.stdout, /Trusted facts:/);
  assert.match(profile.stdout, /Pending facts:/);
  assert.match(profile.stdout, /Ignored\/quarantined evidence:/);
});
