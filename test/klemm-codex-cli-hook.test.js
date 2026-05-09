import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
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

async function runCommand(command, args, { env = {}, timeoutMs = 20000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: 124, stdout, stderr: `${stderr}\nTimed out: ${command} ${args.join(" ")}` });
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

async function writeExecutable(path, body) {
  await writeFile(path, body, "utf8");
  await access(path, constants.F_OK);
  await chmod(path, 0o755);
}

test("codex hook install status doctor and uninstall manage the plain codex route", async () => {
  const root = await mkdtemp(join(tmpdir(), "klemm-codex-hook-install-"));
  const dataDir = join(root, "data");
  const home = join(root, "home");
  const realBin = join(root, "real-bin");
  const shellProfile = join(home, ".zshrc");
  await mkdir(realBin, { recursive: true });
  await mkdir(home, { recursive: true });
  const realCodex = join(realBin, "codex");
  await writeExecutable(realCodex, "#!/usr/bin/env bash\necho real-codex \"$@\"\n");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, PATH: `${realBin}:${process.env.PATH}` };

  const installed = await runKlemm([
    "codex",
    "hook",
    "install",
    "--home",
    home,
    "--shell-profile",
    shellProfile,
    "--data-dir",
    dataDir,
    "--real-codex",
    realCodex,
  ], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Codex CLI hook installed/);
  assert.match(installed.stdout, /Plain Codex route:/);

  const hookPath = join(home, ".klemm", "bin", "codex");
  await access(hookPath, constants.X_OK);
  const profile = await readFile(shellProfile, "utf8");
  assert.match(profile, /klemm codex hook/);
  assert.match(profile, new RegExp(`export PATH="${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/\\.klemm\\/bin:\\$PATH"`));

  const hookedEnv = { ...env, PATH: `${join(home, ".klemm", "bin")}:${realBin}:${process.env.PATH}` };
  const status = await runKlemm(["codex", "hook", "status", "--home", home], { env: hookedEnv });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Installed: yes/);
  assert.match(status.stdout, /Executable: yes/);
  assert.match(status.stdout, /PATH first: yes/);
  assert.match(status.stdout, /Recursion safe: yes/);
  assert.match(status.stdout, /Plain codex routed through Klemm: yes/);

  const doctor = await runKlemm(["codex", "hook", "doctor", "--home", home], { env: hookedEnv });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Doctor: pass/);

  const inactiveDoctor = await runKlemm(["codex", "hook", "doctor", "--home", home], { env });
  assert.equal(inactiveDoctor.status, 1, inactiveDoctor.stdout);
  assert.match(inactiveDoctor.stdout, /Plain codex routed through Klemm: not yet/);
  assert.match(inactiveDoctor.stdout, /Doctor: needs_repair/);
  assert.match(inactiveDoctor.stdout, /restart your shell/);

  const uninstalled = await runKlemm([
    "codex",
    "hook",
    "uninstall",
    "--home",
    home,
    "--shell-profile",
    shellProfile,
  ], { env: hookedEnv });
  assert.equal(uninstalled.status, 0, uninstalled.stderr);
  assert.match(uninstalled.stdout, /Codex CLI hook uninstalled/);
  const cleanedProfile = await readFile(shellProfile, "utf8");
  assert.doesNotMatch(cleanedProfile, /klemm codex hook/);
});

test("plain codex invocation is woven through Klemm before reaching real Codex", async () => {
  const root = await mkdtemp(join(tmpdir(), "klemm-codex-hook-run-"));
  const dataDir = join(root, "data");
  const home = join(root, "home");
  const realBin = join(root, "real-bin");
  await mkdir(realBin, { recursive: true });
  await mkdir(home, { recursive: true });
  const realCodex = join(realBin, "codex");
  await writeExecutable(realCodex, "#!/usr/bin/env bash\necho REAL CODEX ARGS: \"$@\"\n");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, PATH: `${realBin}:${process.env.PATH}` };

  const installed = await runKlemm([
    "codex",
    "hook",
    "install",
    "--home",
    home,
    "--data-dir",
    dataDir,
    "--real-codex",
    realCodex,
    "--no-shell",
  ], { env });
  assert.equal(installed.status, 0, installed.stderr);

  const hookedEnv = { ...env, PATH: `${join(home, ".klemm", "bin")}:${realBin}:${process.env.PATH}` };
  const plain = await runCommand("codex", ["--mission", "codex-owned-value", "alpha", "beta"], { env: hookedEnv });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Codex wrapper session started: mission-codex-plain-/);
  assert.match(plain.stdout, /Blessed path: klemm codex wrap/);
  assert.match(plain.stdout, /Turn start reported: accepted/);
  assert.match(plain.stdout, /REAL CODEX ARGS: --mission codex-owned-value alpha beta/);
  assert.match(plain.stdout, /Turn finish reported: accepted/);
  assert.match(plain.stdout, /What Klemm saw:/);

  const mission = plain.stdout.match(/Codex wrapper session started: (mission-codex-plain-\d+)/)?.[1];
  assert.ok(mission, plain.stdout);
  const turnStatus = await runKlemm(["codex", "turn", "status", "--mission", mission], { env: hookedEnv });
  assert.equal(turnStatus.status, 0, turnStatus.stderr);
  assert.match(turnStatus.stdout, /turn_starts=1/);
  assert.match(turnStatus.stdout, /turn_finishes=1/);

  const contract = await runKlemm(["codex", "contract", "status", "--mission", mission], { env: hookedEnv });
  assert.equal(contract.status, 0, contract.stderr);
  assert.match(contract.stdout, /turn_coverage=yes/);
  assert.match(contract.stdout, /supervised_runs=yes/);
});

test("codex integration install ships both klemm-codex and the plain codex hook", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-codex-hook-integration-"));
  const installDir = join(dataDir, "codex-integration");
  const env = { KLEMM_DATA_DIR: dataDir };

  const installed = await runKlemm(["codex", "install", "--output-dir", installDir, "--data-dir", dataDir], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Wrapper:/);
  assert.match(installed.stdout, /Plain codex hook:/);
  assert.match(installed.stdout, /Hook config:/);

  await access(join(installDir, "bin", "klemm-codex"), constants.X_OK);
  await access(join(installDir, "bin", "codex"), constants.X_OK);
  const hookConfig = JSON.parse(await readFile(join(installDir, "codex-hook.json"), "utf8"));
  assert.equal(hookConfig.hookDir, join(installDir, "bin"));
  assert.equal(hookConfig.dataDir, dataDir);
});
