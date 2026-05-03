#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  buildCodexContext,
  distillMemory,
  evaluateAgentAlignment,
  getKlemmStatus,
  ingestMemoryExport,
  recordAgentActivity,
  proposeAction,
  recordAgentEvent,
  recordOsObservation,
  recordQueuedDecision,
  recordSupervisedRun,
  renderKlemmDashboard,
  registerAgent,
  reviewMemory,
  startCodexHub,
  startMission,
  summarizeDebrief,
} from "./klemm.js";
import { createKlemmHttpServer } from "./klemm-daemon.js";
import {
  buildOsObservation,
  collectFileActivitySnapshot,
  collectProcessSnapshot,
  defaultMacOsPermissionSnapshot,
  parseProcessTable,
} from "./klemm-os.js";
import { createKlemmStore } from "./klemm-store.js";

const store = createKlemmStore();

const AGENT_RUNTIME_PROFILES = {
  codex: {
    agentId: "agent-runtime-codex",
    name: "Codex",
    kind: "codex_agent",
    command: ["codex"],
  },
  claude: {
    agentId: "agent-runtime-claude",
    name: "Claude Code",
    kind: "claude_agent",
    command: ["claude"],
  },
  shell: {
    agentId: "agent-runtime-shell",
    name: "Shell Agent",
    kind: "shell_agent",
    command: [],
  },
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "status";

  try {
    if (command === "status") return printStatus();
    if (command === "codex" && args[1] === "hub") return startCodexHubFromCli(args.slice(2));
    if (command === "codex" && args[1] === "event") return recordCodexEventFromCli(args.slice(2));
    if (command === "codex" && args[1] === "context") return printCodexContext(args.slice(2));
    if (command === "codex" && args[1] === "debrief") return printCodexDebrief(args.slice(2));
    if (command === "mission" && args[1] === "start") return startMissionFromCli(args.slice(2));
    if (command === "agent" && args[1] === "register") return registerAgentFromCli(args.slice(2));
    if (command === "event" && args[1] === "record") return recordEventFromCli(args.slice(2));
    if (command === "agents") return printAgents();
    if (command === "propose") return proposeFromCli(args.slice(1));
    if (command === "queue") return printQueue();
    if (command === "approve") return recordQueueOutcome(args.slice(1), "approved");
    if (command === "deny") return recordQueueOutcome(args.slice(1), "denied");
    if (command === "rewrite") return recordQueueOutcome(args.slice(1), "rewritten");
    if (command === "memory" && args[1] === "ingest") return await ingestMemoryFromCli(args.slice(2));
    if (command === "memory" && args[1] === "ingest-export") return await ingestMemoryExportFromCli(args.slice(2));
    if (command === "memory" && args[1] === "review") return printMemoryReview();
    if (command === "memory" && ["approve", "reject", "pin"].includes(args[1])) {
      return reviewMemoryFromCli(args.slice(2), memoryCommandToStatus(args[1]));
    }
    if (command === "debrief") return printDebrief(args.slice(1));
    if (command === "tui") return await printTui(args.slice(1));
    if (command === "run") return await runRuntimeFromCli(args.slice(1));
    if (command === "supervise") return await superviseFromCli(args.slice(1));
    if (command === "supervised-runs") return printSupervisedRuns();
    if (command === "monitor" && args[1] === "status") return printMonitorStatus(args.slice(2));
    if (command === "monitor" && args[1] === "evaluate") return evaluateMonitorFromCli(args.slice(2));
    if (command === "os" && args[1] === "snapshot") return await recordOsSnapshotFromCli(args.slice(2));
    if (command === "os" && args[1] === "status") return printOsStatus(args.slice(2));
    if (command === "os" && args[1] === "permissions") return printOsPermissions();
    if (command === "daemon") {
      await startDaemonFromCli(args.slice(1));
      return;
    }
    if (command === "help" || command === "--help" || command === "-h") return printHelp();

    throw new Error(`Unknown Klemm command: ${args.join(" ")}`);
  } finally {
    store.close();
  }
}

function startCodexHubFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    startCodexHub(state, {
      id: flags.id,
      goal: flags.goal,
      durationMinutes: flags.duration ? Number(flags.duration) : undefined,
      escalationChannel: flags.escalation,
    }),
  );
  const mission = next.missions[0];
  const agent = next.agents[0];

  console.log(`Codex hub mission started: ${mission.id}`);
  console.log(`Goal: ${mission.goal}`);
  console.log(`Agent: ${agent.id} (${agent.kind})`);
  console.log(`Allowed: ${mission.allowedActions.join(",")}`);
  console.log(`Blocked: ${mission.blockedActions.join(",")}`);
}

async function startDaemonFromCli(args) {
  if (args[0] === "health") return await printDaemonHealth(args.slice(1));
  if (args[0] === "status") return await printDaemonProcessStatus(args.slice(1));
  const flags = parseFlags(args);
  const port = Number(flags.port ?? process.env.KLEMM_PORT ?? 8765);
  const host = flags.host ?? "127.0.0.1";
  const server = createKlemmHttpServer({
    getState: () => store.getState(),
    saveState: (state) => store.saveState(state),
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  if (flags.pidFile) await writeFile(flags.pidFile, String(process.pid), "utf8");
  console.log(`Klemm daemon listening on http://${host}:${address.port}`);
  await new Promise((resolve) => {
    const shutdown = () => {
      server.close(async () => {
        if (flags.pidFile) {
          try {
            await unlink(flags.pidFile);
          } catch {
            // The pid file may already be gone if a supervisor cleaned it up.
          }
        }
        resolve();
      });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function printDaemonHealth(args) {
  const flags = parseFlags(args);
  const url = flags.url ?? `http://${flags.host ?? "127.0.0.1"}:${flags.port ?? process.env.KLEMM_PORT ?? 8765}`;
  const response = await fetch(`${String(url).replace(/\/$/, "")}/api/health`);
  if (!response.ok) throw new Error(`Daemon health check failed: HTTP ${response.status}`);
  const health = await response.json();

  console.log(`Daemon health: ${health.status}`);
  console.log(`Version: ${health.version}`);
  console.log(`Uptime ms: ${health.uptimeMs}`);
  console.log(`Store updated: ${health.updatedAt ?? "unknown"}`);
}

async function printDaemonProcessStatus(args) {
  const flags = parseFlags(args);
  const pidFile = flags.pidFile ?? process.env.KLEMM_PID_FILE;
  if (!pidFile) throw new Error("Usage: klemm daemon status --pid-file <path>");

  let pid;
  try {
    pid = Number((await readFile(pidFile, "utf8")).trim());
  } catch {
    console.log("Daemon process: not running");
    console.log(`PID file: ${pidFile}`);
    return;
  }

  if (!Number.isFinite(pid) || pid <= 0) {
    console.log("Daemon process: not running");
    console.log(`PID file: ${pidFile}`);
    return;
  }

  try {
    process.kill(pid, 0);
    console.log("Daemon process: running");
    console.log(`PID: ${pid}`);
    console.log(`PID file: ${pidFile}`);
  } catch {
    console.log("Daemon process: not running");
    console.log(`PID: ${pid}`);
    console.log(`PID file: ${pidFile}`);
  }
}

function printStatus() {
  const state = store.getState();
  const status = getKlemmStatus(state);
  console.log("Klemm status");
  console.log(`Active missions: ${status.activeMissionCount}`);
  console.log(`Active agents: ${status.activeAgentCount}`);
  console.log(`Queued decisions: ${status.queuedCount}`);
  console.log(`Memories: ${status.memoryCount} (${status.pendingMemoryReviewCount} pending review)`);
  console.log(`Authority decisions: ${status.recentDecisionCount}`);
  console.log(`OS observations: ${status.osObservationCount}`);
}

function startMissionFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    startMission(state, {
      id: flags.id,
      hub: flags.hub,
      goal: flags.goal,
      allowedActions: flags.allow,
      blockedActions: flags.block,
      rewriteAllowed: Boolean(flags.rewrite ?? true),
      durationMinutes: flags.duration ? Number(flags.duration) : undefined,
      escalationChannel: flags.escalation,
    }),
  );
  const mission = next.missions[0];

  console.log(`Mission started: ${mission.id}`);
  console.log(`Hub: ${mission.hub}`);
  console.log(`Goal: ${mission.goal}`);
  console.log(`Expires: ${mission.expiresAt}`);
  console.log(`Allowed: ${mission.allowedActions.join(",")}`);
  console.log(`Blocked: ${mission.blockedActions.join(",")}`);
  console.log(`Rewrite allowed: ${mission.rewriteAllowed}`);
}

function registerAgentFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    registerAgent(state, {
      id: flags.id,
      missionId: flags.mission,
      name: flags.name,
      kind: flags.kind,
      command: flags.command,
    }),
  );
  const agent = next.agents[0];

  console.log(`Agent registered: ${agent.id}`);
  console.log(`Mission: ${agent.missionId}`);
  console.log(`Name: ${agent.name}`);
  console.log(`Kind: ${agent.kind}`);
  console.log(`Status: ${agent.status}`);
}

function recordCodexEventFromCli(args) {
  const flags = parseFlags(args);
  const actionId = flags.actionId;
  const generatedEventId = flags.id ?? (actionId ? `event-codex-${actionId}` : undefined);
  return recordEventFromCli([
    ...(generatedEventId ? ["--id", generatedEventId] : []),
    "--agent",
    "agent-codex",
    ...args,
  ], { codexLabel: true });
}

function printCodexContext(args) {
  const flags = parseFlags(args);
  console.log(JSON.stringify(buildCodexContext(store.getState(), { missionId: flags.mission }), null, 2));
}

function printCodexDebrief(args) {
  const flags = parseFlags(args);
  console.log("Codex debrief packet");
  console.log(summarizeDebrief(store.getState(), { missionId: flags.mission }));
}

function printAgents() {
  const state = store.getState();
  console.log("Klemm agents");
  for (const agent of state.agents) {
    console.log(`- ${agent.id} ${agent.status} mission=${agent.missionId} kind=${agent.kind} name="${agent.name}"`);
  }
}

function recordEventFromCli(args, { codexLabel = false } = {}) {
  const flags = parseFlags(args);
  const action = flags.actionId
    ? {
        id: flags.actionId,
        actor: flags.actor ?? flags.agent ?? "agent",
        actionType: flags.actionType ?? flags.type,
        target: flags.target,
        externality: flags.external,
        reversibility: flags.reversibility,
        missionRelevance: flags.relevance ?? "related",
        suggestedRewrite: flags.suggestedRewrite ?? flags.rewriteTo,
      }
    : null;
  const next = store.update((state) =>
    recordAgentEvent(state, {
      id: flags.id,
      missionId: flags.mission,
      agentId: flags.agent,
      type: flags.type,
      summary: flags.summary,
      action,
    }),
  );
  const event = next.agentEvents[0];
  const decision = action?.id ? next.decisions.find((item) => item.id === action.id) : null;

  console.log(`${codexLabel ? "Codex event" : "Event"} recorded: ${event.id}`);
  console.log(`Type: ${event.type}`);
  console.log(`Mission: ${event.missionId}`);
  if (decision) printDecision(decision);
}

function proposeFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    proposeAction(state, {
      id: flags.id,
      missionId: flags.mission,
      actor: flags.actor,
      actionType: flags.type,
      target: flags.target,
      externality: flags.external,
      reversibility: flags.reversibility,
      privacyExposure: flags.privacy,
      moneyImpact: flags.money,
      legalImpact: flags.legal,
      reputationImpact: flags.reputation,
      credentialImpact: flags.credential,
      missionRelevance: flags.relevance ?? "related",
      suggestedRewrite: flags.suggestedRewrite ?? flags.rewriteTo,
    }),
  );
  const decision = next.decisions[0];

  printDecision(decision);
}

function printQueue() {
  const queued = store.getState().queue.filter((item) => item.status === "queued");
  console.log("Klemm queue");
  if (queued.length === 0) {
    console.log("No queued decisions.");
    return;
  }

  for (const item of queued) {
    console.log(`- ${item.id} ${item.riskLevel} ${item.actor} ${item.actionType} ${item.target}: ${item.reason}`);
  }
}

function recordQueueOutcome(args, outcome) {
  const [decisionId, ...noteParts] = args;
  if (!decisionId) throw new Error(`Usage: klemm ${outcome === "denied" ? "deny" : outcome} <decision-id> [note]`);
  const next = store.update((state) =>
    recordQueuedDecision(state, {
      decisionId,
      outcome,
      note: noteParts.join(" "),
    }),
  );
  const queued = next.queue.find((item) => item.id === decisionId);

  console.log(`Decision recorded: ${queued.status}`);
  console.log(`Decision ID: ${queued.id}`);
  console.log(`Note: ${queued.note || "none"}`);
}

async function ingestMemoryFromCli(args) {
  const flags = parseFlags(args);
  const source = flags.source ?? "manual";
  const text = flags.text ?? (flags.file ? await readFile(flags.file, "utf8") : "");
  if (!text) throw new Error("Usage: klemm memory ingest --source <source> (--text <text> | --file <path>)");

  const before = store.getState();
  const next = store.update((state) =>
    distillMemory(state, {
      source,
      sourceRef: flags.ref ?? flags.file ?? source,
      text,
    }),
  );
  console.log(`Memory ingested from ${source}`);
  console.log(`Distilled: ${next.memories.length - before.memories.length}`);
  console.log(`Rejected: ${next.rejectedMemoryInputs.length - before.rejectedMemoryInputs.length}`);
}

async function ingestMemoryExportFromCli(args) {
  const flags = parseFlags(args);
  const source = flags.source ?? "ai_chat_export";
  const text = flags.text ?? (flags.file ? await readFile(flags.file, "utf8") : "");
  if (!text) throw new Error("Usage: klemm memory ingest-export --source <source> (--text <json-or-text> | --file <path>)");

  const before = store.getState();
  const next = store.update((state) =>
    ingestMemoryExport(state, {
      source,
      sourceRef: flags.ref ?? flags.file ?? source,
      text,
    }),
  );
  const importRecord = next.imports[0];

  console.log(`Memory export ingested from ${source}`);
  console.log(`Messages: ${importRecord.messageCount}`);
  console.log(`Distilled: ${next.memories.length - before.memories.length}`);
  console.log(`Rejected: ${next.rejectedMemoryInputs.length - before.rejectedMemoryInputs.length}`);
}

function printMemoryReview() {
  const state = store.getState();
  console.log("Klemm memory review");
  for (const memory of state.memories.filter((item) => item.status === "pending_review")) {
    console.log(`- ${memory.id} [${memory.memoryClass}] confidence=${memory.confidence} source=${memory.source}: ${memory.text}`);
  }
  for (const rejected of state.rejectedMemoryInputs.slice(0, 10)) {
    console.log(`- rejected ${rejected.id}: ${rejected.reason}`);
  }
}

function reviewMemoryFromCli(args, status) {
  const [memoryId, ...noteParts] = args;
  if (!memoryId) throw new Error(`Usage: klemm memory ${status} <memory-id> [note]`);
  const next = store.update((state) =>
    reviewMemory(state, {
      memoryId,
      status,
      note: noteParts.join(" "),
    }),
  );
  const memory = next.memories.find((item) => item.id === memoryId);

  console.log(`Memory reviewed: ${memory.id} ${memory.status}`);
  console.log(`Note: ${memory.reviewNote || "none"}`);
}

function printDebrief(args) {
  const flags = parseFlags(args);
  console.log(summarizeDebrief(store.getState(), { missionId: flags.mission }));
}

async function printTui(args) {
  const flags = parseFlags(args);
  console.log(renderKlemmDashboard(store.getState(), { missionId: flags.mission }));
  if (!flags.interactive) return;

  console.log("Interactive Klemm TUI");
  console.log("Commands: approve|deny <decision-id> [note], memory approve|reject|pin <memory-id> [note], quit");
  const input = await readStdin();
  for (const line of input.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    if (line === "quit" || line === "exit") {
      console.log("bye");
      return;
    }
    const [command, subcommand, id, ...noteParts] = splitShellLike(line);
    if (command === "approve" || command === "deny" || command === "rewrite") {
      recordQueueOutcome([subcommand, id, ...noteParts].filter(Boolean), command === "deny" ? "denied" : command === "approve" ? "approved" : "rewritten");
      continue;
    }
    if (command === "memory" && ["approve", "reject", "pin"].includes(subcommand)) {
      reviewMemoryFromCli([id, ...noteParts], memoryCommandToStatus(subcommand));
      continue;
    }
    console.log(`Unknown interactive command: ${line}`);
  }
}

async function superviseFromCli(args) {
  const separator = args.indexOf("--");
  const flagArgs = separator >= 0 ? args.slice(0, separator) : [];
  const command = separator >= 0 ? args.slice(separator + 1) : args;
  const flags = parseFlags(flagArgs);
  if (command.length === 0) throw new Error("Usage: klemm supervise [--mission <id>] -- <command> [args...]");

  const target = command.join(" ");
  const commandCwd = flags.cwd ?? process.cwd();
  const commandProposal = buildCommandProposal(command, {
    missionId: flags.mission,
    actor: flags.actor ?? "supervised_process",
    suggestedRewrite: flags.rewriteTo,
  });
  const proposalState = store.update((state) =>
    proposeAction(state, commandProposal),
  );
  const decision = proposalState.decisions[0];
  if (decision.decision === "rewrite") {
    console.log("Klemm rewrote command");
    console.log(`Rewrite: ${decision.rewrite}`);
    const result = await runSupervisedProcess(splitShellLike(decision.rewrite), { cwd: commandCwd, capture: flags.capture, missionId: flags.mission });
    if (flags.capture) persistCapturedRun(flags, decision.rewrite, result, commandCwd);
    if (flags.watch) recordAndPrintAlignment(flags, {
      actor: flags.actor ?? "supervised_process",
      command: decision.rewrite,
      result,
    });
    console.log(`Klemm supervised exit: ${result.status}`);
    process.exitCode = result.status;
    return;
  }
  if (decision.decision !== "allow") {
    console.log("Klemm blocked command before launch");
    printDecision(decision);
    process.exitCode = decision.decision === "queue" ? 2 : 1;
    return;
  }

  const result = await runSupervisedProcess(command, { cwd: commandCwd, capture: flags.capture, missionId: flags.mission });
  if (flags.capture) persistCapturedRun(flags, target, result, commandCwd);
  if (flags.watch) recordAndPrintAlignment(flags, {
    actor: flags.actor ?? "supervised_process",
    command: target,
    result,
  });
  console.log(`Klemm supervised exit: ${result.status}`);
  process.exitCode = result.status;
}

async function runRuntimeFromCli(args) {
  const profileName = args[0];
  const profile = AGENT_RUNTIME_PROFILES[profileName];
  if (!profile) throw new Error(`Usage: klemm run <${Object.keys(AGENT_RUNTIME_PROFILES).join("|")}> [--mission <id>] [--dry-run] -- [args...]`);

  const rest = args.slice(1);
  const separator = rest.indexOf("--");
  const flagArgs = separator >= 0 ? rest.slice(0, separator) : rest;
  const runtimeArgs = separator >= 0 ? rest.slice(separator + 1) : [];
  const flags = parseFlags(flagArgs);
  const command = profile.command.length > 0 ? [...profile.command, ...runtimeArgs] : runtimeArgs;
  if (command.length === 0) throw new Error(`Usage: klemm run ${profileName} [--mission <id>] -- <command> [args...]`);

  const commandCwd = flags.cwd ?? process.cwd();
  const withAgent = store.update((state) =>
    registerAgent(state, {
      id: flags.agentId ?? profile.agentId,
      missionId: flags.mission,
      name: flags.name ?? profile.name,
      kind: profile.kind,
      command: command.join(" "),
    }),
  );
  const agent = withAgent.agents[0];
  const withDecision = store.update((state) =>
    proposeAction(
      state,
      buildCommandProposal(command, {
        missionId: flags.mission,
        actor: agent.id,
        suggestedRewrite: flags.rewriteTo,
      }),
    ),
  );
  const decision = withDecision.decisions[0];

  console.log(`Agent runtime profile: ${profileName}`);
  console.log(`Agent registered: ${agent.id}`);
  console.log(`Command: ${command.join(" ")}`);

  if (decision.decision !== "allow" && decision.decision !== "rewrite") {
    console.log("Klemm blocked runtime before launch");
    printDecision(decision);
    process.exitCode = decision.decision === "queue" ? 2 : 1;
    return;
  }

  if (flags.dryRun) {
    console.log("Dry run: launch skipped");
    printDecision(decision);
    return;
  }

  const commandToRun = decision.decision === "rewrite" ? splitShellLike(decision.rewrite) : command;
  if (decision.decision === "rewrite") {
    console.log("Klemm rewrote runtime command");
    console.log(`Rewrite: ${decision.rewrite}`);
  }
  const result = await runSupervisedProcess(commandToRun, { cwd: commandCwd, capture: flags.capture });
  if (flags.capture) persistCapturedRun(flags, commandToRun.join(" "), result, commandCwd);
  console.log(`Klemm runtime exit: ${result.status}`);
  process.exitCode = result.status;
}

async function runSupervisedProcess(command, { cwd = process.cwd(), capture = false } = {}) {
  const startedAt = new Date().toISOString();
  const beforeSnapshot = capture ? await snapshotFiles(cwd) : new Map();
  const started = Date.now();
  const output = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
  const afterSnapshot = capture ? await snapshotFiles(cwd) : new Map();
  return {
    ...output,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    fileChanges: capture ? diffSnapshots(beforeSnapshot, afterSnapshot) : [],
  };
}

function persistCapturedRun(flags, command, result, cwd) {
  const next = store.update((state) =>
    recordSupervisedRun(state, {
      missionId: flags.mission,
      command,
      cwd,
      exitCode: result.status,
      durationMs: result.durationMs,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      fileChanges: result.fileChanges,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    }),
  );
  console.log(`Capture ID: ${next.supervisedRuns[0].id}`);
}

function printSupervisedRuns() {
  const runs = store.getState().supervisedRuns ?? [];
  console.log("Supervised runs");
  if (runs.length === 0) {
    console.log("No supervised runs captured.");
    return;
  }
  for (const run of runs) {
    console.log(
      `- ${run.id} mission=${run.missionId ?? "none"} exit=${run.exitCode} durationMs=${run.durationMs} files=${run.fileChanges.join(",") || "none"} stdout=${oneLine(run.stdout)} stderr=${oneLine(run.stderr)}`,
    );
  }
}

function recordAndPrintAlignment(flags, { actor, command, result }) {
  const withActivity = store.update((state) =>
    recordAgentActivity(state, {
      missionId: flags.mission,
      agentId: actor,
      type: "command",
      summary: `${command} exited ${result.status}`,
      target: command,
      command,
      exitCode: result.status,
      fileChanges: result.fileChanges,
      evidence: {
        stdout: oneLine(result.stdout),
        stderr: oneLine(result.stderr),
        durationMs: result.durationMs,
      },
    }),
  );
  const activity = withActivity.agentActivities[0];
  const evaluated = store.update((state) =>
    evaluateAgentAlignment(state, {
      missionId: flags.mission,
      agentId: activity.agentId,
    }),
  );
  const report = evaluated.alignmentReports[0];
  const intervention = evaluated.agentInterventions.find((item) => item.alignmentReportId === report.id);

  console.log(`Klemm activity: ${activity.id}`);
  console.log(`Klemm alignment: ${report.state}`);
  console.log(`Reason: ${report.reason}`);
  if (intervention) console.log(`Intervention: ${intervention.type} ${intervention.message}`);
}

function printMonitorStatus(args) {
  const flags = parseFlags(args);
  const state = store.getState();
  const activities = (state.agentActivities ?? []).filter((activity) => !flags.mission || activity.missionId === flags.mission);
  const reports = (state.alignmentReports ?? []).filter((report) => !flags.mission || report.missionId === flags.mission);
  const interventions = (state.agentInterventions ?? []).filter((intervention) => !flags.mission || intervention.missionId === flags.mission);

  console.log("Agent monitor");
  console.log(`Activities: ${activities.length}`);
  console.log(`Latest alignment: ${reports[0]?.state ?? "none"}`);
  console.log(`Active interventions: ${interventions.filter((intervention) => intervention.status === "active").length}`);
  for (const report of reports.slice(0, 5)) {
    console.log(`- ${report.id} ${report.state} agent=${report.agentId}: ${report.reason}`);
  }
}

function evaluateMonitorFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    evaluateAgentAlignment(state, {
      missionId: flags.mission,
      agentId: flags.agent,
    }),
  );
  const report = next.alignmentReports[0];
  const intervention = next.agentInterventions.find((item) => item.alignmentReportId === report.id);

  console.log(`Klemm alignment: ${report.state}`);
  console.log(`Report: ${report.id}`);
  console.log(`Reason: ${report.reason}`);
  if (intervention) console.log(`Intervention: ${intervention.type} ${intervention.message}`);
}

async function recordOsSnapshotFromCli(args) {
  const flags = parseFlags(args);
  const state = store.getState();
  const processes = flags.processFile ? parseProcessTable(await readFile(flags.processFile, "utf8")) : await collectProcessSnapshot();
  const watchPaths = collectRepeatedFlag(args, "--watch-path");
  const fileEvents = await collectFileActivitySnapshot(watchPaths);
  const missionId = flags.mission;
  const supervisedCommands = state.agents
    .filter((agent) => !missionId || agent.missionId === missionId)
    .map((agent) => agent.command);
  const observation = buildOsObservation({
    missionId,
    processes,
    supervisedCommands,
    permissions: defaultMacOsPermissionSnapshot(),
    fileEvents,
    appActivity: flags.frontmostApp
      ? {
          frontmostApp: flags.frontmostApp,
          source: "cli",
        }
      : null,
    notes: flags.notes,
  });
  const next = store.update((current) => recordOsObservation(current, observation));
  const recorded = next.osObservations[0];

  console.log(`OS observation recorded: ${recorded.id}`);
  console.log(`Mission: ${recorded.missionId ?? "none"}`);
  console.log(`Platform: ${recorded.platform}`);
  console.log(`Processes: ${recorded.processCount}`);
  console.log(`Unmanaged agents: ${recorded.unmanagedAgents.length}`);
  console.log(`File events: ${recorded.fileEvents.length}`);
  if (recorded.appActivity?.frontmostApp) console.log(`Frontmost app: ${recorded.appActivity.frontmostApp}`);
  for (const agent of recorded.unmanagedAgents) {
    console.log(`- pid=${agent.pid} ${agent.name}: ${agent.command}`);
  }
}

function printOsStatus(args) {
  const flags = parseFlags(args);
  const observations = (store.getState().osObservations ?? []).filter((observation) => !flags.mission || observation.missionId === flags.mission);
  console.log("OS observations");
  if (observations.length === 0) {
    console.log("No OS observations recorded.");
    return;
  }
  for (const observation of observations.slice(0, 10)) {
    console.log(
      `- ${observation.id} mission=${observation.missionId ?? "none"} processes=${observation.processCount} unmanaged=${observation.unmanagedAgents.length} platform=${observation.platform}`,
      `files=${observation.fileEvents?.length ?? 0}`,
    );
  }
}

function printOsPermissions() {
  const permissions = defaultMacOsPermissionSnapshot();
  console.log("OS observation permissions");
  console.log(`Accessibility: ${permissions.accessibility}`);
  console.log(`Screen recording: ${permissions.screenRecording}`);
  console.log(`File events: ${permissions.fileEvents}`);
}

function printDecision(decision) {
  console.log(`Decision: ${decision.decision}`);
  console.log(`Risk: ${decision.riskLevel}`);
  console.log(`Decision ID: ${decision.id}`);
  console.log(`Reason: ${decision.reason}`);
  if (decision.rewrite) console.log(`Rewrite: ${decision.rewrite}`);
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const part = args[index];
    if (!part.startsWith("--")) continue;
    const key = toCamel(part.slice(2));
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

function collectRepeatedFlag(args, flagName) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flagName && args[index + 1] && !args[index + 1].startsWith("--")) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function commandLooksDestructive(command) {
  return /(^|\s)(rm|sudo|chmod|chown)\b.*(-rf|777|\/)/i.test(command.join(" "));
}

function buildCommandProposal(command, { missionId, actor, suggestedRewrite } = {}) {
  const target = command.join(" ");
  const lower = target.toLowerCase();
  const destructive = commandLooksDestructive(command);
  const gitPush = /^git\s+push\b/i.test(target) || /\bgit\s+push\b/i.test(target);
  const deployment = /\b(vercel|netlify|fly|railway|npm|pnpm|yarn)\b.*\b(deploy|publish)\b/i.test(target) || /\bdeploy\b.*\b(--prod|production)\b/i.test(target);
  const credential = /\b(secret|token|credential|api[-_ ]?key|oauth)\b/i.test(target);
  const externalSend = /\b(sendmail|mail|slack|tweet|post)\b/i.test(target);
  const financial = /\b(stripe|plaid|quickbooks|xero)\b.*\b(refund|charge|pay|transfer|invoice)\b/i.test(target);

  let actionType = "command";
  if (destructive) actionType = "destructive_command";
  if (gitPush) actionType = "git_push";
  if (deployment) actionType = "deployment";
  if (credential) actionType = lower.includes("oauth") ? "oauth_scope_change" : "credential_change";
  if (externalSend) actionType = "external_send";
  if (financial) actionType = "financial_action";

  return {
    missionId,
    actor,
    actionType,
    target,
    reversibility: actionType === "command" ? "reversible" : "hard_to_reverse",
    externality: actionType === "command" || actionType === "destructive_command" ? "local_only" : actionType,
    credentialImpact: actionType === "credential_change" || actionType === "oauth_scope_change",
    moneyImpact: actionType === "financial_action",
    missionRelevance: "related",
    suggestedRewrite,
  };
}

function splitShellLike(command) {
  return command.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g)?.map((part) => part.replace(/^['"]|['"]$/g, "")) ?? [];
}

async function snapshotFiles(root) {
  const snapshot = new Map();
  await visitFiles(root, root, snapshot);
  return snapshot;
}

async function visitFiles(root, current, snapshot) {
  let entries = [];
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      await visitFiles(root, absolute, snapshot);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(absolute);
    snapshot.set(relative(root, absolute), `${info.mtimeMs}:${info.size}`);
  }
}

function diffSnapshots(before, after) {
  const changes = [];
  for (const [path, signature] of after) {
    if (!before.has(path)) {
      changes.push(path);
    } else if (before.get(path) !== signature) {
      changes.push(path);
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changes.push(path);
  }
  return [...new Set(changes)].sort();
}

function memoryCommandToStatus(command) {
  if (command === "approve") return "approved";
  if (command === "reject") return "rejected";
  if (command === "pin") return "pinned";
  return command;
}

function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function printHelp() {
  console.log(`
Klemm CLI

Commands:
  klemm status
  klemm codex hub --goal "..." [--id mission-codex]
  klemm codex event --mission mission-id --type command_planned --summary "..." --action-id decision-id --action-type command --target "npm test"
  klemm codex context --mission mission-id
  klemm codex debrief --mission mission-id
  klemm mission start --hub codex --goal "..." [--allow a,b] [--block x,y] [--rewrite]
  klemm agent register --id agent-codex --mission mission-id --name Codex --kind coding_agent
  klemm event record --mission mission-id --agent agent-codex --type command_planned --summary "..."
  klemm agents
  klemm propose --mission mission-id --actor Codex --type git_push --target "origin main"
  klemm queue
  klemm approve|deny|rewrite <decision-id> [note]
  klemm memory ingest --source chatgpt_export --file export.txt
  klemm memory ingest-export --source chatgpt_export --file export.json
  klemm memory approve|reject|pin <memory-id> [note]
  klemm memory review
  klemm debrief [--mission mission-id]
  klemm tui [--mission mission-id] [--interactive]
  klemm run codex|claude|shell [--mission mission-id] [--dry-run] [--capture] -- [args...]
  klemm supervise [--mission mission-id] [--capture] [--watch] [--cwd path] -- <command> [args...]
  klemm supervised-runs
  klemm monitor status [--mission mission-id]
  klemm monitor evaluate [--mission mission-id] [--agent agent-id]
  klemm os snapshot [--mission mission-id] [--process-file fixture.txt]
  klemm os status [--mission mission-id]
  klemm os permissions
  klemm daemon [--host 127.0.0.1] [--port 8765] [--pid-file path]
  klemm daemon health [--url http://127.0.0.1:8765]
  klemm daemon status --pid-file path
`.trim());
}

main().catch((error) => {
  console.error(`Klemm error: ${error.message}`);
  process.exitCode = 1;
  store.close();
});
