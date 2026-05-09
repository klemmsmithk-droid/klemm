import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
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

test("default product surfaces hide Cursor and avoid fake completion claims", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-alpha-product-"));
  const home = await mkdtemp(join(tmpdir(), "klemm-alpha-home-"));
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };

  const install = await runKlemm(["install", "--data-dir", dataDir, "--home", home], { env });
  assert.equal(install.status, 0, install.stderr);

  const start = await runKlemm(["start", "--no-open"], { env });
  assert.equal(start.status, 0, start.stderr);
  assert.doesNotMatch(start.stdout, /Cursor/);

  const adapters = await runKlemm(["adapters", "status", "--live", "--home", home], { env });
  assert.equal(adapters.status, 0, adapters.stderr);
  assert.match(adapters.stdout, /Codex:/);
  assert.match(adapters.stdout, /Claude:/);
  assert.match(adapters.stdout, /Shell:/);
  assert.doesNotMatch(adapters.stdout, /Cursor:/);

  const docs = [
    await readFile(join(process.cwd(), "README.md"), "utf8"),
    await readFile(join(process.cwd(), "docs", "launch", "x-posts.md"), "utf8"),
    await readFile(join(process.cwd(), "docs", "alpha-hardening.md"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(docs, /95%|95 percent|ninety-five/i);
  assert.match(docs, /Unmanaged agents are observed and recommended for wrapping/i);
  assert.match(docs, /OS-wide hard blocking is only claimed/i);
});

test("repair proves its fixes and uninstall removes shipping artifacts in a fake home", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-alpha-repair-data-"));
  const home = await mkdtemp(join(tmpdir(), "klemm-alpha-repair-home-"));
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home };

  const doctorBefore = await runKlemm(["doctor", "--data-dir", dataDir, "--home", home, "--skip-health"], { env });
  assert.equal(doctorBefore.status, 1, doctorBefore.stdout);
  assert.match(doctorBefore.stdout, /Plain Codex is not protected/);

  const repair = await runKlemm(["repair", "--data-dir", dataDir, "--home", home], { env });
  assert.equal(repair.status, 0, repair.stderr);
  assert.match(repair.stdout, /Verification after repair:/);
  assert.match(repair.stdout, /Plain Codex protected: yes/);
  assert.match(repair.stdout, /Healthy/);

  const doctorAfter = await runKlemm(["doctor", "--data-dir", dataDir, "--home", home, "--skip-health"], { env });
  assert.equal(doctorAfter.status, 0, doctorAfter.stdout);
  assert.match(doctorAfter.stdout, /Plain Codex protected: yes/);

  const uninstall = await runKlemm(["uninstall", "--data-dir", dataDir, "--home", home, "--shell-profile", join(home, ".zshrc")], { env });
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.match(uninstall.stdout, /Removed plain Codex hook/);
  assert.match(uninstall.stdout, /Removed shell profile block/);
  assert.match(uninstall.stdout, /Removed LaunchAgent/);
  await assert.rejects(access(join(home, ".klemm", "bin", "codex")));
  await assert.rejects(access(join(dataDir, "codex-integration", "bin", "klemm-codex")));
});
