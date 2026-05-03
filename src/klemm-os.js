import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const AGENT_PROCESS_PATTERNS = [
  /\bcodex\b/i,
  /\bclaude\b/i,
  /\bcursor\b/i,
  /\bchatgpt\b/i,
  /\bagent\b/i,
  /\bautonomous\b/i,
];

export function parseProcessTable(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^pid\s+/i.test(line))
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        name: match[2],
        command: match[3],
      };
    })
    .filter(Boolean);
}

export async function collectProcessSnapshot() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,comm=,command="], {
    maxBuffer: 1024 * 1024,
  });
  return parseProcessTable(`PID COMM COMMAND\n${stdout}`);
}

export function buildOsObservation(options = {}) {
  const now = options.now ?? new Date().toISOString();
  const processes = normalizeProcesses(options.processes);
  const supervisedCommands = new Set(
    (options.supervisedCommands ?? [])
      .map((command) => String(command ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const unmanagedAgents = processes
    .filter((process) => isAgentLikeProcess(process))
    .filter((process) => !isSupervisedProcess(process, supervisedCommands))
    .map((process) => ({
      pid: process.pid,
      name: process.name,
      command: process.command,
      reason: "agent-like process is running outside Klemm supervision",
    }));

  return {
    id: options.id ?? `os-observation-${compactTimestamp(now)}`,
    missionId: options.missionId,
    observedAt: now,
    platform: options.platform ?? process.platform,
    processes,
    processCount: processes.length,
    unmanagedAgents,
    permissions: normalizePermissions(options.permissions),
    fileEvents: options.fileEvents ?? [],
    appActivity: options.appActivity ?? null,
    notes: options.notes ?? "",
  };
}

export async function collectFileActivitySnapshot(paths = []) {
  const events = [];
  for (const path of paths.filter(Boolean)) {
    await visitFilePath(path, path, events);
  }
  return events;
}

export function defaultMacOsPermissionSnapshot() {
  if (process.platform !== "darwin") {
    return {
      accessibility: "unsupported",
      screenRecording: "unsupported",
      fileEvents: "available",
    };
  }

  return {
    accessibility: "unknown",
    screenRecording: "unknown",
    fileEvents: "available",
  };
}

function normalizeProcesses(processes = []) {
  return processes.map((process) => ({
    pid: Number(process.pid),
    name: String(process.name ?? ""),
    command: String(process.command ?? ""),
  }));
}

function normalizePermissions(permissions = {}) {
  return {
    accessibility: permissions.accessibility ?? defaultMacOsPermissionSnapshot().accessibility,
    screenRecording: permissions.screenRecording ?? defaultMacOsPermissionSnapshot().screenRecording,
    fileEvents: permissions.fileEvents ?? defaultMacOsPermissionSnapshot().fileEvents,
  };
}

function isAgentLikeProcess(process) {
  const value = `${process.name} ${process.command}`;
  return AGENT_PROCESS_PATTERNS.some((pattern) => pattern.test(value));
}

function isSupervisedProcess(process, supervisedCommands) {
  const command = String(process.command ?? "").trim().toLowerCase();
  const name = String(process.name ?? "").trim().toLowerCase();
  for (const supervised of supervisedCommands) {
    if (!supervised) continue;
    if (command === supervised) return true;
    if (command.startsWith(`${supervised} `)) return true;
    if (supervised === name) return true;
  }
  return false;
}

async function visitFilePath(root, current, events) {
  let info;
  try {
    info = await stat(current);
  } catch {
    return;
  }

  if (info.isDirectory()) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      await visitFilePath(root, join(current, entry.name), events);
    }
    return;
  }

  if (!info.isFile()) return;
  events.push({
    path: root === current ? current : relative(root, current),
    event: "observed",
    size: info.size,
    mtimeMs: info.mtimeMs,
  });
}

function compactTimestamp(now) {
  return String(now).replace(/[-:.TZ]/g, "").slice(0, 14);
}
