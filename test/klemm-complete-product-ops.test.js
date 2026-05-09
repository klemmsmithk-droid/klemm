import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "src", "klemm-cli.js");

async function runKlemm(args, { env = {}, timeoutMs = 30000 } = {}) {
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

test("package build, dry-run signing, dry-run notarization, and update channel publish form a release lane", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-release-lane-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const output = join(dataDir, "dist");
  const channelDir = join(dataDir, "channel");

  const built = await runKlemm(["package", "build", "--output", output, "--version", "1.0.0"], { env });
  assert.equal(built.status, 0, built.stderr);
  assert.match(built.stdout, /Klemm package built/);
  assert.match(built.stdout, /Installer:/);
  assert.match(built.stdout, /Manifest:/);
  const manifest = built.stdout.match(/Manifest: (.+)/)?.[1].trim();
  assert.ok(manifest, built.stdout);

  const signed = await runKlemm(["package", "sign", "--artifact", manifest, "--identity", "Developer ID Application: Example", "--dry-run"], { env });
  assert.equal(signed.status, 0, signed.stderr);
  assert.match(signed.stdout, /Codesign dry run/);
  assert.match(signed.stdout, /Developer ID Application: Example/);

  const notarized = await runKlemm(["package", "notarize", "--artifact", manifest, "--profile", "KlemmNotary", "--dry-run"], { env });
  assert.equal(notarized.status, 0, notarized.stderr);
  assert.match(notarized.stdout, /Notarization dry run/);
  assert.match(notarized.stdout, /xcrun notarytool submit/);

  const published = await runKlemm(["update", "channel", "publish", "--artifact", manifest, "--channel-dir", channelDir], { env });
  assert.equal(published.status, 0, published.stderr);
  assert.match(published.stdout, /Update channel published/);
  assert.match(published.stdout, /channel.json/);

  const status = await runKlemm(["update", "channel", "status", "--channel-dir", channelDir], { env });
  assert.match(status.stdout, /Update Channel Status/);
  assert.match(status.stdout, /Latest version: 1.0.0/);
});

test("daemon telemetry records uptime samples without requiring a live network daemon", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-daemon-telemetry-"));
  const env = { KLEMM_DATA_DIR: dataDir };

  const sample = await runKlemm(["daemon", "telemetry", "sample", "--data-dir", dataDir, "--offline"], { env });
  assert.equal(sample.status, 0, sample.stderr);
  assert.match(sample.stdout, /Daemon telemetry sample/);
  assert.match(sample.stdout, /Uptime:/);
  assert.match(sample.stdout, /Source: offline/);

  const status = await runKlemm(["daemon", "telemetry", "status"], { env });
  assert.match(status.stdout, /Daemon Uptime Telemetry/);
  assert.match(status.stdout, /Samples: 1/);
});

test("release, telemetry, and review commands tolerate concurrent local store writes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-concurrent-ops-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const output = join(dataDir, "dist");
  const built = await runKlemm(["package", "build", "--output", output, "--version", "1.0.1"], { env });
  assert.equal(built.status, 0, built.stderr);
  const manifest = built.stdout.match(/Manifest: (.+)/)?.[1].trim();
  assert.ok(manifest, built.stdout);

  const results = await Promise.all([
    runKlemm(["package", "sign", "--artifact", manifest, "--identity", "Developer ID Application: Example", "--dry-run"], { env }),
    runKlemm(["package", "notarize", "--artifact", manifest, "--profile", "KlemmNotary", "--dry-run"], { env }),
    runKlemm(["update", "channel", "publish", "--artifact", manifest, "--channel-dir", join(dataDir, "channel")], { env }),
    runKlemm(["daemon", "telemetry", "sample", "--offline"], { env }),
    runKlemm(["security", "review", "package", "--output", join(dataDir, "security-review"), "--auditor", "external"], { env }),
  ]);

  for (const result of results) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /database is locked/i);
  }
});

test("live adapter scan records real-session discovery without pretending control", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-live-session-scan-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const processFile = join(dataDir, "ps.txt");
  await writeFile(processFile, [
    "123 ?? 00:00:03 /Applications/Codex.app/Contents/MacOS/Codex",
    "124 ?? 00:00:01 claude code --dangerously-skip-permissions",
    "125 ?? 00:00:02 /Applications/Cursor.app/Contents/MacOS/Cursor",
    "126 ?? 00:00:01 browser-agent run task",
  ].join("\n"), "utf8");

  const scan = await runKlemm(["adapters", "live", "scan", "--mission", "mission-live-scan", "--process-file", processFile], { env });
  assert.equal(scan.status, 0, scan.stderr);
  assert.match(scan.stdout, /Live Adapter Session Scan/);
  assert.match(scan.stdout, /Codex: live observed/);
  assert.match(scan.stdout, /Claude: live observed/);
  assert.match(scan.stdout, /Cursor: live observed/);
  assert.match(scan.stdout, /Browser: live observed/);
  assert.match(scan.stdout, /Control: observe-only until wrapped or adapted/);

  const status = await runKlemm(["adapters", "live", "status", "--mission", "mission-live-scan"], { env });
  assert.match(status.stdout, /Live Adapter Sessions/);
  assert.match(status.stdout, /codex live observed/);
  assert.match(status.stdout, /browser live observed/);
});

test("security review package creates an external-auditor handoff with threat model and evidence commands", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "klemm-security-review-"));
  const env = { KLEMM_DATA_DIR: dataDir };
  const output = join(dataDir, "security-review");

  const review = await runKlemm(["security", "review", "package", "--output", output, "--auditor", "external"], { env });
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /Security review package created/);
  assert.match(review.stdout, /Threat model:/);
  assert.match(review.stdout, /Audit scope:/);
  assert.match(review.stdout, /Evidence commands:/);
  assert.match(review.stdout, /External auditor: external/);

  const status = await runKlemm(["security", "review", "status"], { env });
  assert.match(status.stdout, /Security Review Status/);
  assert.match(status.stdout, /Packages: 1/);
  assert.match(status.stdout, /external/);
});
