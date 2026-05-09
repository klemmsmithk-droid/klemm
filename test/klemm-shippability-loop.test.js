import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, input = "", timeoutMs = 30000 } = {}) {
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

async function writeExecutable(path, body) {
  await writeFile(path, body, "utf8");
  await chmod(path, 0o755);
}

test("shippable install dry run writes nothing and real install protects plain codex", async () => {
  const root = await mkdtemp(join(tmpdir(), "klemm-ship-install-"));
  const dataDir = join(root, "data");
  const home = join(root, "home");
  const realBin = join(root, "real-bin");
  await mkdir(realBin, { recursive: true });
  await mkdir(home, { recursive: true });
  const realCodex = join(realBin, "codex");
  await writeExecutable(realCodex, "#!/usr/bin/env bash\necho real codex \"$@\"\n");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, PATH: `${realBin}:${process.env.PATH}` };

  const dryRun = await runKlemm(["install", "--dry-run", "--data-dir", dataDir, "--home", home, "--real-codex", realCodex], { env });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Klemm install dry run/);
  assert.match(dryRun.stdout, /Would install plain codex hook:/);
  assert.equal(existsSync(join(dataDir, "com.klemm.daemon.plist")), false);
  assert.equal(existsSync(join(home, ".klemm", "bin", "codex")), false);

  const installed = await runKlemm(["install", "--data-dir", dataDir, "--home", home, "--real-codex", realCodex], { env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Klemm is installed/);
  assert.match(installed.stdout, /Plain codex hook:/);
  assert.match(installed.stdout, /Shell completions:/);
  assert.match(installed.stdout, /Klemm is running\. Plain codex is protected\. Run klemm start\./);
  assert.doesNotMatch(installed.stdout, /Klemm doctor/);

  await access(join(dataDir, "com.klemm.daemon.plist"), constants.F_OK);
  await access(join(dataDir, "codex-integration", "skills", "klemm", "SKILL.md"), constants.F_OK);
  await access(join(dataDir, "codex-integration", "mcp.json"), constants.F_OK);
  await access(join(dataDir, "codex-integration", "bin", "klemm-codex"), constants.X_OK);
  await access(join(home, ".klemm", "bin", "codex"), constants.X_OK);
  await access(join(home, ".klemm", "completions", "_klemm"), constants.F_OK);

  const doctor = await runKlemm(["codex", "hook", "doctor", "--home", home], {
    env: { ...env, PATH: `${join(home, ".klemm", "bin")}:${realBin}:${process.env.PATH}` },
  });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Plain codex routed through Klemm: yes/);
  assert.match(doctor.stdout, /Doctor: pass/);
});

test("doctor explains broken shipping checks and repair fixes the repairable pieces", async () => {
  const root = await mkdtemp(join(tmpdir(), "klemm-ship-repair-"));
  const dataDir = join(root, "data");
  const home = join(root, "home");
  const realBin = join(root, "real-bin");
  await mkdir(dataDir, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(realBin, { recursive: true });
  const realCodex = join(realBin, "codex");
  await writeExecutable(realCodex, "#!/usr/bin/env bash\necho real codex\n");
  await writeFile(join(dataDir, "klemm.pid"), "999999\n", "utf8");
  await chmod(dataDir, 0o777);
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, PATH: `${realBin}:${process.env.PATH}` };
  await runKlemm(["mission", "start", "--id", "mission-stale-ship", "--goal", "Old work"], { env });

  const broken = await runKlemm(["doctor", "--data-dir", dataDir, "--home", home, "--skip-health"], { env });
  assert.equal(broken.status, 1, broken.stdout);
  assert.match(broken.stdout, /Klemm doctor/);
  assert.match(broken.stdout, /Plain-English summary/);
  assert.match(broken.stdout, /Plain Codex is not protected/);
  assert.match(broken.stdout, /Missing \/klemm skill/);
  assert.match(broken.stdout, /Stale daemon PID/);
  assert.match(broken.stdout, /Unsafe permissions/);
  assert.match(broken.stdout, /Stale active mission/);
  assert.match(broken.stdout, /Run: klemm repair/);

  const repaired = await runKlemm(["repair", "--data-dir", dataDir, "--home", home, "--real-codex", realCodex], { env });
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.match(repaired.stdout, /Fixed/);
  assert.match(repaired.stdout, /plain codex hook/);
  assert.match(repaired.stdout, /stale daemon PID/);
  assert.match(repaired.stdout, /unsafe permissions/);
  assert.match(repaired.stdout, /stale mission/);
  assert.match(repaired.stdout, /Still needs you/);
  assert.match(repaired.stdout, /Healthy/);

  const healthy = await runKlemm(["doctor", "--data-dir", dataDir, "--home", home, "--skip-health"], {
    env: { ...env, PATH: `${join(home, ".klemm", "bin")}:${realBin}:${process.env.PATH}` },
  });
  assert.equal(healthy.status, 0, healthy.stdout);
  assert.match(healthy.stdout, /Plain Codex protected: yes/);
  assert.doesNotMatch(healthy.stdout, /Stale daemon PID/);
});

test("klemm start is a calm product console and golden demo proves the policing loop", async () => {
  const root = await mkdtemp(join(tmpdir(), "klemm-ship-demo-"));
  const dataDir = join(root, "data");
  const home = join(root, "home");
  const realBin = join(root, "real-bin");
  await mkdir(home, { recursive: true });
  await mkdir(realBin, { recursive: true });
  const realCodex = join(realBin, "codex");
  await writeExecutable(realCodex, "#!/usr/bin/env bash\necho fixture codex safe work \"$@\"\n");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, PATH: `${realBin}:${process.env.PATH}` };
  await runKlemm(["install", "--data-dir", dataDir, "--home", home, "--real-codex", realCodex], { env });

  const activeEnv = { ...env, PATH: `${join(home, ".klemm", "bin")}:${realBin}:${process.env.PATH}` };
  const start = await runKlemm(["start", "--no-open"], { env: activeEnv, input: "status\nagents\nrepair\nquit\n" });
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /1\. Status/);
  assert.match(start.stdout, /2\. Agents/);
  assert.match(start.stdout, /3\. Context/);
  assert.match(start.stdout, /4\. Memory/);
  assert.match(start.stdout, /5\. Trust/);
  assert.match(start.stdout, /6\. Autopilot/);
  assert.match(start.stdout, /7\. Repair/);
  assert.doesNotMatch(start.stdout, /Missions/);
  assert.match(start.stdout, /Unresolved queue: 0/);
  assert.match(start.stdout, /Plain Codex protected:/);
  assert.match(start.stdout, /Codex: protected/);
  assert.match(start.stdout, /Repair/);

  const demo = await runKlemm(["demo", "golden", "--fixture-codex", "--data-dir", dataDir, "--home", home, "--real-codex", realCodex], {
    env: activeEnv,
    timeoutMs: 40000,
  });
  assert.equal(demo.status, 0, demo.stderr);
  assert.match(demo.stdout, /Klemm Golden Demo/);
  assert.match(demo.stdout, /Plain codex protected: yes/);
  assert.match(demo.stdout, /Safe work observed/);
  assert.match(demo.stdout, /Risky action queued/);
  assert.match(demo.stdout, /Klemm Watch Report/);
  assert.match(demo.stdout, /Klemm debrief/);
  assert.match(demo.stdout, /Demo mode: fixture Codex/);
});

test("uninstall removes shipping artifacts and docs carry alpha-safe launch copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "klemm-ship-uninstall-"));
  const dataDir = join(root, "data");
  const home = join(root, "home");
  const realBin = join(root, "real-bin");
  await mkdir(home, { recursive: true });
  await mkdir(realBin, { recursive: true });
  const realCodex = join(realBin, "codex");
  await writeExecutable(realCodex, "#!/usr/bin/env bash\necho real codex\n");
  const env = { KLEMM_DATA_DIR: dataDir, HOME: home, PATH: `${realBin}:${process.env.PATH}` };
  await runKlemm(["install", "--data-dir", dataDir, "--home", home, "--real-codex", realCodex], { env });

  const dryRun = await runKlemm(["uninstall", "--dry-run", "--data-dir", dataDir, "--home", home], { env });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Klemm uninstall dry run/);
  assert.match(dryRun.stdout, /Would remove: .*codex-integration/);
  assert.match(dryRun.stdout, /Would remove: .*\.klemm\/bin\/codex/);

  const removed = await runKlemm(["uninstall", "--data-dir", dataDir, "--home", home], { env });
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stdout, /Klemm uninstalled/);
  assert.equal(existsSync(join(home, ".klemm", "bin", "codex")), false);
  assert.equal(existsSync(join(dataDir, "codex-integration")), false);

  const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
  assert.match(readme, /Klemm is a local authority layer for AI agents\./);
  assert.match(readme, /It watches agents, keeps them on-mission, queues risky actions, and explains decisions\./);
  assert.match(readme, /klemm demo golden/);
  const xPosts = await readFile(join(process.cwd(), "docs", "launch", "x-posts.md"), "utf8");
  assert.match(xPosts, /Klemm is a local authority layer for AI agents\./);
  assert.match(xPosts, /No OS-wide hard blocking is claimed unless Endpoint Security is actually available\./);
  const hardening = await readFile(join(process.cwd(), "docs", "alpha-hardening.md"), "utf8");
  assert.match(hardening, /Unmanaged agents are observed and recommended for wrapping, not automatically controlled\./);
  assert.match(hardening, /No fake completion claims/);
});
