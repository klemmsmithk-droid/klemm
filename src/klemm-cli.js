#!/usr/bin/env -S node --no-warnings
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { chmod, copyFile, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  addContextSyncSource,
  addAdapterClient,
  buildContextSyncPlan,
  buildUserModelSummary,
  buildCodexContext,
  addStructuredPolicy,
  distillMemory,
  evaluateAgentAlignment,
  getKlemmStatus,
  importContextSource,
  importMemorySource,
  ingestMemoryExport,
  migrateKlemmState,
  normalizeAgentAdapterEnvelope,
  renderLaunchAgentPlist,
  recordContextSyncRun,
  searchMemories,
  simulatePolicyDecision,
  recordAgentActivity,
  proposeAction,
  recordAgentEvent,
  recordOsObservation,
  recordQueuedDecision,
  recordSupervisedRun,
  redactSensitiveText,
  renderKlemmDashboard,
  registerAgent,
  reviewMemory,
  promoteMemoryToPolicy,
  startCodexHub,
  startMission,
  summarizeDebrief,
  updateContextSyncSource,
} from "./klemm.js";
import { createKlemmHttpServer } from "./klemm-daemon.js";
import { executeKlemmTool } from "./klemm-tools.js";
import {
  buildOsObservation,
  collectFileActivitySnapshot,
  collectProcessSnapshot,
  defaultMacOsPermissionSnapshot,
  parseProcessTable,
} from "./klemm-os.js";
import { createKlemmStore, KLEMM_DATA_DIR } from "./klemm-store.js";

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

const POLICY_PACKS = {
  "coding-afk": [
    { id: "git-push-review", name: "Review git pushes while AFK", actionTypes: ["git_push"], externalities: ["git_push"], severity: "high" },
    { id: "deployment-review", name: "Review deployments while AFK", actionTypes: ["deployment"], externalities: ["deployment"], severity: "high" },
    { id: "credential-review", name: "Review credential changes while AFK", actionTypes: ["credential_change", "oauth_scope_change"], severity: "critical" },
  ],
  "finance-accounting": [
    { id: "financial-action-review", name: "Review financial actions", actionTypes: ["financial_action"], severity: "critical" },
    { id: "accounting-write-review", name: "Review accounting writes", actionTypes: ["quickbooks_write", "xero_write", "stripe_write"], severity: "high" },
  ],
  "email-calendar": [
    { id: "external-send-review", name: "Review outbound messages", actionTypes: ["external_send"], severity: "high" },
    { id: "calendar-change-review", name: "Review calendar changes", actionTypes: ["calendar_change"], severity: "medium" },
  ],
  "browser-research": [
    { id: "purchase-review", name: "Review purchases and checkouts", actionTypes: ["financial_action", "purchase"], severity: "high" },
    { id: "form-submit-review", name: "Review external form submissions", actionTypes: ["external_send"], targetIncludes: ["form", "submit"], severity: "medium" },
  ],
  "strict-no-external": [
    { id: "no-external-send", name: "Strict no external sends", actionTypes: ["external_send"], severity: "critical" },
    { id: "no-git-push", name: "Strict no git pushes", actionTypes: ["git_push"], severity: "critical" },
    { id: "no-deployments", name: "Strict no deployments", actionTypes: ["deployment"], severity: "critical" },
    { id: "no-financial-actions", name: "Strict no financial actions", actionTypes: ["financial_action"], severity: "critical" },
    { id: "no-credential-changes", name: "Strict no credential changes", actionTypes: ["credential_change", "oauth_scope_change"], severity: "critical" },
  ],
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "status";

  try {
    if (command === "status") return await printStatus();
    if (command === "version") return await printVersion();
    if (command === "codex" && args[1] === "hub") return startCodexHubFromCli(args.slice(2));
    if (command === "codex" && args[1] === "event") return recordCodexEventFromCli(args.slice(2));
    if (command === "codex" && args[1] === "context") return printCodexContext(args.slice(2));
    if (command === "codex" && args[1] === "debrief") return printCodexDebrief(args.slice(2));
    if (command === "codex" && args[1] === "dogfood") return startCodexDogfoodFromCli(args.slice(2));
    if (command === "codex" && args[1] === "report") return recordCodexAdapterReportFromCli(args.slice(2));
    if (command === "codex" && args[1] === "run") return await runCodexWatchedCommandFromCli(args.slice(2));
    if (command === "codex" && args[1] === "wrap") return await wrapCodexSessionFromCli(args.slice(2));
    if (command === "codex" && args[1] === "install") return await installCodexIntegrationFromCli(args.slice(2));
    if (command === "setup") return await setupKlemmFromCli(args.slice(1));
    if (command === "install" && args[1] !== "mcp") return await installKlemmFromCli(args.slice(1));
    if (command === "mission" && args[1] === "start") return await startMissionFromCli(args.slice(2));
    if (command === "mission" && args[1] === "list") return listMissionsFromCli();
    if (command === "mission" && args[1] === "current") return printCurrentMissionFromCli();
    if (command === "mission" && args[1] === "finish") return finishMissionFromCli(args.slice(2));
    if (command === "agent" && args[1] === "register") return registerAgentFromCli(args.slice(2));
    if (command === "event" && args[1] === "record") return recordEventFromCli(args.slice(2));
    if (command === "agents") return printAgents();
    if (command === "propose") return await proposeFromCli(args.slice(1));
    if (command === "queue" && args[1] === "inspect") return printQueueDecisionFromCli(args.slice(2));
    if (command === "queue" && args[1] === "approve") return await recordQueueOutcome(args.slice(2), "approved");
    if (command === "queue" && args[1] === "deny") return await recordQueueOutcome(args.slice(2), "denied");
    if (command === "queue" && args[1] === "rewrite") return await recordQueueOutcome(args.slice(2), "rewritten");
    if (command === "queue") return printQueue();
    if (command === "approve") return await recordQueueOutcome(args.slice(1), "approved");
    if (command === "deny") return await recordQueueOutcome(args.slice(1), "denied");
    if (command === "rewrite") return await recordQueueOutcome(args.slice(1), "rewritten");
    if (command === "memory" && args[1] === "ingest") return await ingestMemoryFromCli(args.slice(2));
    if (command === "memory" && args[1] === "ingest-export") return await ingestMemoryExportFromCli(args.slice(2));
    if (command === "memory" && args[1] === "import-source") return await importMemorySourceFromCli(args.slice(2));
    if (command === "context" && args[1] === "import") return await importContextSourceFromCli(args.slice(2));
    if (command === "memory" && args[1] === "search") return searchMemoryFromCli(args.slice(2));
    if (command === "memory" && args[1] === "review") return printMemoryReview(args.slice(2));
    if (command === "memory" && args[1] === "promote-policy") return promoteMemoryPolicyFromCli(args.slice(2));
    if (command === "memory" && ["approve", "reject", "pin"].includes(args[1])) {
      return reviewMemoryFromCli(args.slice(2), memoryCommandToStatus(args[1]));
    }
    if (command === "user" && args[1] === "model") return printUserModel(args.slice(2));
    if (command === "sync" && args[1] === "add") return addSyncSourceFromCli(args.slice(2));
    if (command === "sync" && args[1] === "plan") return printContextSyncPlan(args.slice(2));
    if (command === "sync" && args[1] === "run") return await runContextSyncFromCli(args.slice(2));
    if (command === "sync" && args[1] === "status") return printSyncStatus(args.slice(2));
    if (command === "onboard" && args[1] === "v2") return await onboardV2FromCli(args.slice(2));
    if (command === "onboard") return await onboardFromCli(args.slice(1));
    if (command === "debrief") return await printDebrief(args.slice(1));
    if (command === "dogfood" && args[1] === "status") return printDogfoodStatus(args.slice(2));
    if (command === "dogfood" && args[1] === "debrief") return await printDebrief(args.slice(2));
    if (command === "tui") return await printTui(args.slice(1));
    if (command === "run") return await runRuntimeFromCli(args.slice(1));
    if (command === "supervise") return await superviseFromCli(args.slice(1));
    if (command === "supervised-runs") return printSupervisedRuns(args.slice(1));
    if (command === "monitor" && args[1] === "status") return printMonitorStatus(args.slice(2));
    if (command === "monitor" && args[1] === "evaluate") return evaluateMonitorFromCli(args.slice(2));
    if (command === "policy" && args[1] === "add") return addPolicyFromCli(args.slice(2));
    if (command === "policy" && args[1] === "simulate") return simulatePolicyFromCli(args.slice(2));
    if (command === "policy" && args[1] === "pack") return policyPackFromCli(args.slice(2));
    if (command === "adapter" && args[1] === "token" && args[2] === "add") return addAdapterTokenFromCli(args.slice(3));
    if (command === "helper" && args[1] === "launch-agent") return renderLaunchAgentFromCli(args.slice(2));
    if (command === "mcp" && args[1] === "stdio") return printMcpCommand();
    if (command === "install" && args[1] === "mcp") return await installMcpFromCli(args.slice(2));
    if (command === "completion") return printCompletion(args.slice(1));
    if (command === "profiles" && args[1] === "template") return printProfileTemplate(args.slice(2));
    if (command === "config" && args[1] === "export") return await exportConfigFromCli(args.slice(2));
    if (command === "config" && args[1] === "import") return await importConfigFromCli(args.slice(2));
    if (command === "uninstall") return await uninstallFromCli(args.slice(1));
    if (command === "os" && args[1] === "snapshot") return await recordOsSnapshotFromCli(args.slice(2));
    if (command === "os" && args[1] === "status") return printOsStatus(args.slice(2));
    if (command === "os" && args[1] === "permissions") return printOsPermissions();
    if (command === "doctor") return await doctorFromCli(args.slice(1));
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

function startCodexDogfoodFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    startCodexHub(state, {
      id: flags.id,
      goal: flags.goal ?? "Dogfood Klemm's Codex adapter.",
      durationMinutes: flags.duration ? Number(flags.duration) : undefined,
      escalationChannel: flags.escalation,
    }),
  );
  const mission = next.missions[0];
  const withPlan = store.update((state) =>
    recordAgentActivity(state, normalizeAgentAdapterEnvelope({
      protocolVersion: 1,
      missionId: mission.id,
      agentId: "agent-codex",
      event: "plan",
      summary: flags.plan ?? `Codex dogfood plan for ${mission.goal}`,
      plan: flags.plan ?? "",
    }).activity),
  );
  const activity = withPlan.agentActivities[0];

  console.log(`Codex dogfood session ready: ${mission.id}`);
  console.log(`Goal: ${mission.goal}`);
  console.log(`Adapter activity: ${activity.id}`);
  console.log(`Next command: klemm supervise --watch-loop --mission ${mission.id} -- <command>`);
}

async function wrapCodexSessionFromCli(args) {
  const separator = args.indexOf("--");
  const flagArgs = separator >= 0 ? args.slice(0, separator) : args;
  const command = separator >= 0 ? args.slice(separator + 1) : [];
  const flags = parseFlags(flagArgs);
  const protocolVersion = flags.protocolVersion ? Number(flags.protocolVersion) : 1;
  const agentId = flags.agent ?? "agent-codex";
  const sessionId = flags.sessionId ?? `codex-session-${Date.now()}`;
  const missionState = store.update((state) =>
    startCodexHub(state, {
      id: flags.id,
      goal: flags.goal ?? "Wrapped Codex session supervised by Klemm.",
      durationMinutes: flags.duration ? Number(flags.duration) : undefined,
    }),
  );
  const mission = missionState.missions[0];
  console.log(`Codex wrapper session started: ${mission.id}`);
  console.log(`Session: ${sessionId}`);
  console.log("Klemm is watching");
  console.log(`Data dir: ${KLEMM_DATA_DIR}`);
  console.log("Watching: commands, tool output, diffs, queue, alignment");
  console.log("Stop: Ctrl-C");
  console.log(`Review: env KLEMM_DATA_DIR="${KLEMM_DATA_DIR}" klemm dogfood status --mission ${mission.id}`);
  console.log(`Finish: env KLEMM_DATA_DIR="${KLEMM_DATA_DIR}" klemm mission finish ${mission.id} "work complete"`);

  const sessionEnv = buildCodexSessionEnv({
    missionId: mission.id,
    agentId,
    sessionId,
    protocolVersion,
    adapterClientId: flags.adapterClient,
    adapterToken: flags.adapterToken,
  });

  const started = executeAdapterEnvelopeTool({
    protocolVersion,
    missionId: mission.id,
    agentId,
    adapterClientId: flags.adapterClient,
    adapterToken: flags.adapterToken,
    event: "session_start",
    target: sessionId,
    summary: `Wrapped Codex session ${sessionId} started.`,
  }).result;
  console.log(`Session start reported: ${started.accepted === false ? "rejected" : "accepted"}`);
  if (started.accepted === false) {
    console.log(`Error: ${started.error}`);
    process.exitCode = 1;
    return;
  }

  const plan = executeAdapterEnvelopeTool({
    protocolVersion,
    missionId: mission.id,
    agentId,
    adapterClientId: flags.adapterClient,
    adapterToken: flags.adapterToken,
    event: "plan",
    summary: flags.plan ?? `Wrapped Codex plan for ${mission.goal}`,
    plan: flags.plan ?? "",
  }).result;
  console.log(`Plan reported: ${plan.accepted === false ? "rejected" : "accepted"}`);
  if (plan.accepted === false) {
    console.log(`Error: ${plan.error}`);
    process.exitCode = 1;
    return;
  }

  let launchOutcome = "completed";
  if (command.length > 0) {
    const guarded = store.update((state) =>
      proposeAction(state, buildCommandProposal(command, {
        missionId: mission.id,
        actor: agentId,
        suggestedRewrite: flags.rewriteTo,
      })),
    );
    const decision = guarded.decisions[0];
    console.log(`Guarded command decision: ${decision.decision}`);
    if (decision.decision === "allow" && !flags.dryRun) {
      await withTemporaryEnv(sessionEnv, async () => {
        await superviseFromCli(["--mission", mission.id, "--actor", agentId, "--watch-loop", "--intercept-output", "--capture", "--record-tree", "--", ...command]);
      });
      launchOutcome = process.exitCode && process.exitCode !== 0 ? `exited_${process.exitCode}` : "completed";
    } else if (decision.decision === "allow" && flags.dryRun) {
      launchOutcome = "dry_run";
    } else {
      launchOutcome = decision.decision === "queue" ? "queued" : "blocked";
      console.log(`Launch ${launchOutcome} before execution`);
      printDecision(decision);
    }
  }

  if (flags.dryRun) {
    console.log("Dry run: Codex launch skipped");
  } else if (command.length === 0) {
    await withTemporaryEnv(sessionEnv, async () => {
      await superviseFromCli([
        "--mission",
        mission.id,
        "--actor",
        agentId,
        "--watch-loop",
        "--intercept-output",
        "--capture",
        "--record-tree",
        "--",
        ...resolveDefaultCodexCommand(flags),
      ]);
    });
    launchOutcome = process.exitCode && process.exitCode !== 0 ? `exited_${process.exitCode}` : "completed";
  }

  const finishedSession = executeAdapterEnvelopeTool({
    protocolVersion,
    missionId: mission.id,
    agentId,
    adapterClientId: flags.adapterClient,
    adapterToken: flags.adapterToken,
    event: "session_finish",
    target: sessionId,
    summary: `Wrapped Codex session ${sessionId} finished: ${launchOutcome}.`,
  }).result;
  console.log(`Session finish reported: ${finishedSession.accepted === false ? "rejected" : "accepted"}`);
  if (finishedSession.accepted === false) {
    console.log(`Error: ${finishedSession.error}`);
    process.exitCode = 1;
  }

  const debriefText = summarizeDebrief(store.getState(), { missionId: mission.id });
  const debrief = executeAdapterEnvelopeTool({
    protocolVersion,
    missionId: mission.id,
    agentId,
    adapterClientId: flags.adapterClient,
    adapterToken: flags.adapterToken,
    event: "debrief",
    summary: "Wrapped Codex session debrief.",
    debrief: debriefText,
  }).result;
  console.log(`Debrief reported: ${debrief.accepted === false ? "rejected" : "accepted"}`);
  if (debrief.accepted === false) {
    console.log(`Error: ${debrief.error}`);
    process.exitCode = 1;
  }
  console.log("Review this session:");
  console.log(`  env KLEMM_DATA_DIR="${KLEMM_DATA_DIR}" klemm debrief --mission ${mission.id}`);
  console.log(`  env KLEMM_DATA_DIR="${KLEMM_DATA_DIR}" klemm queue`);
  if (flags.finish) {
    const finished = finishMissionLocal(mission.id, "Wrapped Codex session completed.");
    console.log(`Mission finished: ${finished.id}`);
  }
}

function buildCodexSessionEnv({ missionId, agentId, sessionId, protocolVersion, adapterClientId, adapterToken }) {
  const contextCommand = `klemm codex context --mission ${missionId}`;
  const runCommand = `klemm codex run --mission ${missionId} --`;
  const debriefCommand = `klemm codex debrief --mission ${missionId}`;
  return {
    KLEMM_MISSION_ID: missionId,
    KLEMM_AGENT_ID: agentId,
    KLEMM_CODEX_SESSION_ID: sessionId,
    KLEMM_CODEX_CONTEXT_COMMAND: contextCommand,
    KLEMM_CODEX_RUN_COMMAND: runCommand,
    KLEMM_CODEX_DEBRIEF_COMMAND: debriefCommand,
    KLEMM_PROTOCOL_VERSION: String(protocolVersion),
    ...(adapterClientId ? { KLEMM_ADAPTER_CLIENT_ID: adapterClientId } : {}),
    ...(adapterToken ? { KLEMM_ADAPTER_TOKEN: adapterToken } : {}),
  };
}

async function withTemporaryEnv(env, callback) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    return await callback();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function installCodexIntegrationFromCli(args) {
  const flags = parseFlags(args);
  const outputDir = flags.outputDir ?? join(KLEMM_DATA_DIR, "codex-integration");
  const skillDir = join(outputDir, "skills", "klemm");
  const binDir = join(outputDir, "bin");
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  await mkdir(skillDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  const sourceSkillPath = join(process.cwd(), ".agents", "skills", "klemm", "SKILL.md");
  let skill = "";
  try {
    skill = await readFile(sourceSkillPath, "utf8");
  } catch {
    skill = buildCodexSkillTemplate();
  }
  await writeFile(join(skillDir, "SKILL.md"), skill, "utf8");
  await writeFile(join(outputDir, "mcp.json"), `${JSON.stringify(buildMcpClientConfig({ client: "codex", dataDir }), null, 2)}\n`, "utf8");
  const wrapper = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `export KLEMM_DATA_DIR="${dataDir.replaceAll('"', '\\"')}"`,
    `exec "${process.execPath}" --no-warnings "${new URL(import.meta.url).pathname}" codex wrap "$@"`,
    "",
  ].join("\n");
  const wrapperPath = join(binDir, "klemm-codex");
  await writeFile(wrapperPath, wrapper, "utf8");
  await chmod(wrapperPath, 0o755);

  console.log(`Codex integration installed: ${outputDir}`);
  console.log(`Skill: ${join(skillDir, "SKILL.md")}`);
  console.log(`MCP config: ${join(outputDir, "mcp.json")}`);
  console.log(`Wrapper: ${wrapperPath}`);
}

async function installKlemmFromCli(args) {
  const flags = parseFlags(args);
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  const codexDir = flags.codexDir ?? join(dataDir, "codex-integration");
  const profilesPath = flags.profiles ?? join(dataDir, "profiles", "default-profiles.json");
  const plistPath = flags.plist ?? join(dataDir, "com.klemm.daemon.plist");
  const policyPack = flags.policyPack ?? "coding-afk";
  const agents = normalizeListFlag(flags.agents || "codex,claude,shell");
  const pidFile = flags.pidFile ?? join(dataDir, "klemm.pid");
  const logFile = flags.logFile ?? join(dataDir, "logs", "klemm-daemon.log");
  const healthSkipped = !flags.checkHealth;

  await withCapturedConsole(async () => {
    await installDaemonFromCli(["--output", plistPath, "--data-dir", dataDir, "--pid-file", pidFile, "--log-file", logFile]);
    migrateDaemonStoreFromCli();
    await installCodexIntegrationFromCli(["--output-dir", codexDir, "--data-dir", dataDir]);
  });
  await writeDefaultProfiles(profilesPath, { agents, dataDir });
  await withCapturedConsole(async () => {
    policyPackFromCli(["apply", policyPack]);
    await doctorFromCli([
      "--data-dir",
      dataDir,
      "--pid-file",
      pidFile,
      "--log-file",
      logFile,
      ...(healthSkipped ? ["--skip-health"] : []),
    ]);
  });

  store.update((state) => ({
    ...state,
    installs: [
      {
        id: `install-${Date.now()}`,
        dataDir,
        codexDir,
        profilesPath,
        plistPath,
        policyPack,
        agents,
        createdAt: new Date().toISOString(),
      },
      ...(state.installs ?? []),
    ],
  }));

  const wrapperPath = join(codexDir, "bin", "klemm-codex");
  console.log("Klemm is installed");
  console.log("");
  console.log("Installed:");
  console.log(`  - Daemon LaunchAgent: ${plistPath}`);
  console.log(`  - Data directory: ${dataDir}`);
  console.log(`  - Codex skill: ${join(codexDir, "skills", "klemm", "SKILL.md")}`);
  console.log(`  - MCP config: ${join(codexDir, "mcp.json")}`);
  console.log(`  - Codex wrapper: ${wrapperPath}`);
  console.log(`  - Runtime profiles: ${profilesPath}`);
  console.log(`  - Policy pack: ${policyPack}`);
  console.log(`  - Doctor: ${healthSkipped ? "passed with daemon health skipped" : "passed"}`);
  console.log("");
  console.log("Next:");
  console.log(`  1. Start daemon: klemm daemon start --data-dir "${dataDir}" --pid-file "${pidFile}" --log-file "${logFile}"`);
  console.log("  2. Check status: klemm status");
  console.log(`  3. Start Codex through Klemm: "${wrapperPath}"`);
}

async function setupKlemmFromCli(args) {
  const flags = parseFlags(args);
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  const plistPath = flags.plist ?? flags.output ?? join(dataDir, "com.klemm.daemon.plist");
  const codexDir = flags.codexDir ?? join(dataDir, "codex-integration");
  const pidFile = flags.pidFile ?? join(dataDir, "klemm.pid");
  const logFile = flags.logFile ?? join(dataDir, "logs", "klemm-daemon.log");

  console.log("Klemm setup");
  await installDaemonFromCli(["--output", plistPath, "--data-dir", dataDir, "--pid-file", pidFile, "--log-file", logFile]);
  migrateDaemonStoreFromCli();
  await installCodexIntegrationFromCli(["--output-dir", codexDir, "--data-dir", dataDir]);

  if (flags.codexHistory) {
    addSyncSourceFromCli(["--id", "codex-history", "--provider", "codex", "--path", flags.codexHistory]);
  }
  if (flags.chatgptExport) {
    addSyncSourceFromCli(["--id", "chatgpt-export", "--provider", "chatgpt", "--path", flags.chatgptExport]);
  }
  if (flags.claudeExport) {
    addSyncSourceFromCli(["--id", "claude-export", "--provider", "claude", "--path", flags.claudeExport]);
  }
  if (flags.chromeHistory) {
    addSyncSourceFromCli(["--id", "chrome-history", "--provider", "chrome_history", "--path", flags.chromeHistory]);
  }
  if (flags.watchRepo) {
    recordWatchPath(flags.watchRepo, { kind: "repo" });
    console.log(`Watch path added: ${flags.watchRepo}`);
  }
  if (flags.never) {
    promoteBoundaryText(flags.never, { source: "setup", note: "Setup authority boundary." });
  }

  store.update((state) => ({
    ...state,
    setupRuns: [
      {
        id: `setup-${Date.now()}`,
        dataDir,
        plistPath,
        codexDir,
        dryRunLaunchctl: Boolean(flags.dryRunLaunchctl),
        createdAt: new Date().toISOString(),
      },
      ...(state.setupRuns ?? []),
    ],
  }));

  if (flags.dryRunLaunchctl) {
    await launchctlFromCli("bootstrap", ["--plist", plistPath, "--dry-run"]);
  }

  console.log("Klemm setup complete");
  console.log(`Daemon plist: ${plistPath}`);
  console.log(`Codex integration: ${codexDir}`);
  console.log(`Health check: klemm daemon health --url http://127.0.0.1:${flags.port ?? process.env.KLEMM_PORT ?? 8765}`);
  console.log("Klemm is watching");
}

async function startDaemonFromCli(args) {
  if (args[0] === "doctor") return await doctorFromCli(args.slice(1));
  if (args[0] === "health") return await printDaemonHealth(args.slice(1));
  if (args[0] === "install") return await installDaemonFromCli(args.slice(1));
  if (args[0] === "migrate") return migrateDaemonStoreFromCli(args.slice(1));
  if (args[0] === "start") return await startDaemonProcessFromCli(args.slice(1));
  if (args[0] === "stop") return await stopDaemonProcessFromCli(args.slice(1));
  if (args[0] === "restart") return await restartDaemonProcessFromCli(args.slice(1));
  if (args[0] === "logs") return await printDaemonLogs(args.slice(1));
  if (args[0] === "status") return await printDaemonProcessStatus(args.slice(1));
  if (args[0] === "bootstrap") return await launchctlFromCli("bootstrap", args.slice(1));
  if (args[0] === "bootout") return await launchctlFromCli("bootout", args.slice(1));
  if (args[0] === "kickstart") return await launchctlFromCli("kickstart", args.slice(1));
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

async function doctorFromCli(args) {
  const flags = parseFlags(args);
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  const pidFile = flags.pidFile ?? join(dataDir, "klemm.pid");
  const logFile = flags.logFile ?? join(dataDir, "logs", "klemm-daemon.log");
  const url = flags.url ?? `http://${flags.host ?? "127.0.0.1"}:${flags.port ?? process.env.KLEMM_PORT ?? 8765}`;
  const checks = [];
  let exitCode = 0;

  const migrated = store.update((state) => migrateKlemmState(state));
  checks.push({ name: "Store", status: "ok", detail: `Schema version: ${migrated.schemaVersion ?? migrated.version ?? 1}` });
  checks.push(await permissionCheck("Permissions", dataDir, { maxMode: 0o755 }));

  const pid = await readPidFile(pidFile);
  if (!pid) {
    checks.push({ name: "PID file", status: existsSync(pidFile) ? "invalid" : "missing", detail: pidFile });
  } else if (isProcessRunning(pid)) {
    checks.push({ name: "PID file", status: "running", detail: `PID: ${pid}` });
  } else if (flags.repair) {
    try {
      await unlink(pidFile);
    } catch {
      // Already removed by another lifecycle command.
    }
    checks.push({ name: "PID file", status: "stale repaired", detail: `Removed stale PID ${pid}` });
  } else {
    checks.push({ name: "PID file", status: "stale", detail: `PID: ${pid}` });
    exitCode = 1;
  }

  checks.push({ name: "Logs", status: existsSync(logFile) ? "ok" : "missing", detail: logFile });

  if (flags.skipHealth) {
    checks.push({ name: "Health", status: "skipped", detail: url });
  } else {
    try {
      const response = await fetch(`${String(url).replace(/\/$/, "")}/api/health`);
      checks.push({ name: "Health", status: response.ok ? "ok" : `http_${response.status}`, detail: url });
      checks.push({ name: "Daemon transport", status: response.ok ? "ok" : "unavailable", detail: url });
      if (!response.ok) exitCode = 1;
    } catch (error) {
      checks.push({ name: "Health", status: "unreachable", detail: error.message });
      checks.push({ name: "Daemon transport", status: "unavailable", detail: url });
      exitCode = 1;
    }
  }

  store.update((state) => ({
    ...state,
    daemonChecks: [
      {
        id: `doctor-${Date.now()}`,
        dataDir,
        pidFile,
        logFile,
        url,
        checks,
        createdAt: new Date().toISOString(),
      },
      ...(state.daemonChecks ?? []),
    ],
  }));

  console.log("Klemm doctor");
  for (const check of checks) {
    console.log(`${check.name}: ${check.status}`);
    if (check.name === "Store") console.log(check.detail);
  }
  process.exitCode = exitCode;
}

async function installDaemonFromCli(args) {
  const flags = parseFlags(args);
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  const logsDir = join(dataDir, "logs");
  const output = flags.output ?? join(dataDir, "com.klemm.daemon.plist");
  const cliPath = new URL(import.meta.url).pathname;
  await mkdir(logsDir, { recursive: true });
  const plist = renderLaunchAgentPlist({
    label: flags.label,
    program: flags.program ?? process.execPath,
    dataDir,
    programArguments: [
      flags.program ?? process.execPath,
      "--no-warnings",
      cliPath,
      "daemon",
      "--host",
      flags.host ?? "127.0.0.1",
      "--port",
      String(flags.port ?? process.env.KLEMM_PORT ?? 8765),
      "--pid-file",
      flags.pidFile ?? join(dataDir, "klemm.pid"),
    ],
    stdoutPath: flags.logFile ?? join(logsDir, "klemm-daemon.log"),
    stderrPath: flags.errorLogFile ?? join(logsDir, "klemm-daemon.err.log"),
  });
  await writeFile(output, `${plist}\n`, "utf8");

  console.log(`Daemon installed: ${output}`);
  console.log(`Data dir: ${dataDir}`);
  console.log(`Logs: ${logsDir}`);
}

async function permissionCheck(name, path, { maxMode = 0o755 } = {}) {
  try {
    const info = await stat(path);
    const mode = info.mode & 0o777;
    return {
      name,
      status: mode <= maxMode ? "ok" : "warning",
      detail: `${path} mode=${mode.toString(8)}`,
    };
  } catch (error) {
    return { name, status: "missing", detail: `${path}: ${error.message}` };
  }
}

function migrateDaemonStoreFromCli() {
  const next = store.update((state) => migrateKlemmState(state));
  console.log("Daemon store migrated");
  console.log(`Schema version: ${next.schemaVersion}`);
  console.log(`Migrations: ${(next.schemaMigrations ?? []).length}`);
}

async function startDaemonProcessFromCli(args) {
  const flags = parseFlags(args);
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  const pidFile = flags.pidFile ?? join(dataDir, "klemm.pid");
  const logFile = flags.logFile ?? join(dataDir, "logs", "klemm-daemon.log");
  const errorLogFile = flags.errorLogFile ?? join(dataDir, "logs", "klemm-daemon.err.log");
  const port = String(flags.port ?? process.env.KLEMM_PORT ?? 8765);
  const host = flags.host ?? "127.0.0.1";
  const cliPath = new URL(import.meta.url).pathname;
  const commandArgs = ["--no-warnings", cliPath, "daemon", "--host", host, "--port", port, "--pid-file", pidFile];
  await mkdir(dirname(logFile), { recursive: true });
  await mkdir(dirname(pidFile), { recursive: true });

  if (flags.dryRun) {
    console.log("Daemon start dry run");
    console.log(`Command: ${process.execPath} ${commandArgs.join(" ")}`);
    console.log(`PID file: ${pidFile}`);
    console.log(`Log file: ${logFile}`);
    return;
  }

  const stdoutFd = openSync(logFile, "a");
  const stderrFd = openSync(errorLogFile, "a");
  const child = spawn(process.execPath, commandArgs, {
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    env: { ...process.env, KLEMM_DATA_DIR: dataDir },
  });
  child.unref();
  console.log(`Daemon started: ${child.pid}`);
  console.log(`PID file: ${pidFile}`);
  console.log(`Log file: ${logFile}`);
}

async function stopDaemonProcessFromCli(args) {
  const flags = parseFlags(args);
  const pidFile = flags.pidFile ?? join(flags.dataDir ?? KLEMM_DATA_DIR, "klemm.pid");
  const pid = await readPidFile(pidFile);
  if (!pid) {
    console.log("Daemon process: not running");
    console.log(`PID file: ${pidFile}`);
    return;
  }
  if (flags.dryRun) {
    console.log(`Daemon stop dry run: ${pid}`);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // It may already be gone.
  }
  try {
    await unlink(pidFile);
  } catch {
    // The pid file may already be gone.
  }
  console.log(`Daemon stopped: ${pid}`);
}

async function restartDaemonProcessFromCli(args) {
  await stopDaemonProcessFromCli(args);
  await startDaemonProcessFromCli(args);
}

async function printDaemonLogs(args) {
  const flags = parseFlags(args);
  const logFile = flags.logFile ?? join(flags.dataDir ?? KLEMM_DATA_DIR, "logs", "klemm-daemon.log");
  const tail = Number(flags.tail ?? 40);
  let content = "";
  try {
    content = await readFile(logFile, "utf8");
  } catch {
    console.log("Daemon logs");
    console.log(`Log file: ${logFile}`);
    console.log("No log file found.");
    return;
  }
  console.log("Daemon logs");
  console.log(`Log file: ${logFile}`);
  for (const line of content.split(/\r?\n/).filter(Boolean).slice(-tail)) {
    console.log(line);
  }
}

async function launchctlFromCli(action, args) {
  const flags = parseFlags(args);
  const domain = flags.domain ?? `gui/${process.getuid?.() ?? 501}`;
  const label = flags.label ?? "com.klemm.daemon";
  const plist = flags.plist ?? join(flags.dataDir ?? KLEMM_DATA_DIR, "com.klemm.daemon.plist");
  let command;
  if (action === "bootstrap") command = ["launchctl", "bootstrap", domain, plist];
  if (action === "bootout") command = ["launchctl", "bootout", domain, plist];
  if (action === "kickstart") command = ["launchctl", "kickstart", "-k", `${domain}/${label}`];
  if (!command) throw new Error(`Unknown launchctl action: ${action}`);

  if (flags.dryRun) {
    console.log(`LaunchAgent ${action} dry run`);
    console.log(command.join(" "));
    return;
  }

  const result = await runCommand(command, { env: process.env });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status;
}

async function runCommand(command, { env = process.env } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
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

  const pid = await readPidFile(pidFile);
  if (!pid) {
    console.log("Daemon process: not running");
    console.log(`PID file: ${pidFile}`);
    if (flags.logFile) console.log(`Log file: ${flags.logFile}`);
    return;
  }

  try {
    process.kill(pid, 0);
    console.log("Daemon process: running");
    console.log(`PID: ${pid}`);
    console.log(`PID file: ${pidFile}`);
    if (flags.logFile) console.log(`Log file: ${flags.logFile}`);
  } catch {
    console.log("Daemon process: not running");
    console.log(`PID: ${pid}`);
    console.log(`PID file: ${pidFile}`);
    if (flags.logFile) console.log(`Log file: ${flags.logFile}`);
  }
}

async function printStatus() {
  const state = store.getState();
  const status = getKlemmStatus(state);
  const daemon = await probeDaemonHealth(process.env.KLEMM_DAEMON_URL);
  console.log("Klemm status");
  console.log(`Data dir: ${KLEMM_DATA_DIR}`);
  console.log(`Daemon transport: ${daemon.ok ? "ok" : "unavailable"}`);
  console.log(`Store fallback: ${daemon.ok ? "available" : "active"}`);
  console.log(`Active missions: ${status.activeMissionCount}`);
  console.log(`Active agents: ${status.activeAgentCount}`);
  console.log(`Queued decisions: ${status.queuedCount}`);
  console.log(`Memories: ${status.memoryCount} (${status.pendingMemoryReviewCount} pending review)`);
  console.log(`Authority decisions: ${status.recentDecisionCount}`);
  console.log(`OS observations: ${status.osObservationCount}`);
}

async function startMissionFromCli(args) {
  const flags = parseFlags(args);
  const payload = {
    id: flags.id,
    hub: flags.hub,
    goal: flags.goal,
    allowedActions: flags.allow,
    blockedActions: flags.block,
    rewriteAllowed: Boolean(flags.rewrite ?? true),
    durationMinutes: flags.duration ? Number(flags.duration) : undefined,
    escalationChannel: flags.escalation,
  };
  const daemon = await callDaemonApi("/api/mission/start", { method: "POST", body: payload });
  if (daemon.ok) {
    console.log("Transport: daemon");
    return printMissionStarted(daemon.payload.mission);
  }
  if (daemon.attempted) console.log("Transport: local fallback");
  const next = store.update((state) =>
    startMission(state, payload),
  );
  const mission = next.missions[0];

  printMissionStarted(mission);
}

function printMissionStarted(mission) {
  console.log(`Mission started: ${mission.id}`);
  console.log(`Hub: ${mission.hub}`);
  console.log(`Goal: ${mission.goal}`);
  console.log(`Expires: ${mission.expiresAt}`);
  console.log(`Allowed: ${mission.allowedActions.join(",")}`);
  console.log(`Blocked: ${mission.blockedActions.join(",")}`);
  console.log(`Rewrite allowed: ${mission.rewriteAllowed}`);
}

function listMissionsFromCli() {
  const missions = store.getState().missions ?? [];
  console.log("Klemm missions");
  if (missions.length === 0) {
    console.log("No missions.");
    return;
  }
  for (const mission of missions) {
    console.log(`- ${mission.id} ${mission.status} hub=${mission.hub} goal=${mission.goal}`);
  }
}

function printCurrentMissionFromCli() {
  const mission = (store.getState().missions ?? []).find((item) => item.status === "active");
  if (!mission) {
    console.log("No active mission.");
    return;
  }
  console.log(`Current mission: ${mission.id}`);
  console.log(`Hub: ${mission.hub}`);
  console.log(`Goal: ${mission.goal}`);
  console.log(`Expires: ${mission.expiresAt}`);
}

function finishMissionFromCli(args) {
  const [missionId, ...noteParts] = args;
  if (!missionId) throw new Error("Usage: klemm mission finish <mission-id> [note]");
  const note = noteParts.join(" ");
  const finished = finishMissionLocal(missionId, note);
  console.log(`Mission finished: ${finished.id}`);
  console.log(`Goal: ${finished.goal}`);
  console.log(`Note: ${note || "none"}`);
}

function finishMissionLocal(missionId, note = "") {
  const now = new Date().toISOString();
  let finished;
  store.update((state) => {
    const missions = (state.missions ?? []).map((mission) => {
      if (mission.id !== missionId) return mission;
      finished = {
        ...mission,
        status: "finished",
        finishedAt: now,
        finishNote: note,
      };
      return finished;
    });
    if (!finished) throw new Error(`Mission not found: ${missionId}`);
    const agents = (state.agents ?? []).map((agent) =>
      agent.missionId === missionId
        ? { ...agent, status: "finished", finishedAt: now }
        : agent,
    );
    return {
      ...state,
      missions,
      agents,
      events: [
        {
          id: `event-mission-finished-${Date.now()}`,
          missionId,
          agentId: "klemm",
          type: "mission_finished",
          summary: note || `Mission ${missionId} finished.`,
          createdAt: now,
        },
        ...(state.events ?? []),
      ],
    };
  });
  return finished;
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

function recordCodexAdapterReportFromCli(args) {
  const flags = parseFlags(args);
  const envelope = normalizeAgentAdapterEnvelope({
    protocolVersion: 1,
    missionId: flags.mission,
    agentId: flags.agent ?? "agent-codex",
    event: flags.type ?? "activity",
    summary: flags.summary,
    adapterClientId: flags.adapterClient,
    adapterToken: flags.adapterToken,
    protocolVersion: flags.protocolVersion ? Number(flags.protocolVersion) : 1,
    target: flags.target,
    command: flags.command,
    toolCall: flags.tool
      ? {
          name: flags.tool,
          arguments: flags.command ? { command: flags.command } : {},
        }
      : undefined,
    diff: flags.file ? { files: normalizeListFlag(flags.file) } : undefined,
    uncertainty: flags.uncertainty,
  });
  let accepted = true;
  let protocol = { negotiatedVersion: envelope.protocolVersion };
  let decision = null;
  let next;
  if (flags.adapterClient || flags.adapterToken) {
    const toolResult = executeAdapterEnvelopeTool(envelope);
    accepted = toolResult.result.accepted;
    protocol = toolResult.result.protocol;
    next = toolResult.state;
    decision = toolResult.result.decision;
    console.log("Codex adapter envelope recorded");
    console.log(`Adapter accepted: ${accepted}`);
    console.log(`Protocol: ${protocol?.negotiatedVersion ?? "none"}`);
    if (!accepted) {
      console.log(`Error: ${toolResult.result.error}`);
      return;
    }
    if (decision) printDecision(decision);
    return;
  }
  next = store.update((state) => recordAgentActivity(state, envelope.activity));
  if (envelope.action) {
    next = store.update((state) => proposeAction(state, buildCommandProposal(splitShellLike(envelope.action.target), {
      missionId: envelope.action.missionId,
      actor: envelope.action.actor,
    })));
    decision = next.decisions[0];
  }
  const activity = next.agentActivities[0];

  console.log("Codex adapter envelope recorded");
  console.log(`Adapter accepted: ${accepted}`);
  console.log(`Protocol: ${protocol?.negotiatedVersion ?? envelope.protocolVersion}`);
  console.log(`Activity: ${activity.id}`);
  console.log(`Type: ${envelope.type}`);
  if (decision) printDecision(decision);
}

function executeAdapterEnvelopeTool(envelope) {
  const output = executeKlemmTool("record_adapter_envelope", envelope, { state: store.getState() });
  store.saveState(output.state);
  return output;
}

async function runCodexWatchedCommandFromCli(args) {
  const separator = args.indexOf("--");
  const flagArgs = separator >= 0 ? args.slice(0, separator) : [];
  const command = separator >= 0 ? args.slice(separator + 1) : args;
  const flags = parseFlags(flagArgs);
  if (command.length === 0) throw new Error("Usage: klemm codex run --mission <id> -- <command> [args...]");
  return await superviseFromCli([
    "--mission",
    flags.mission,
    "--actor",
    flags.agent ?? "agent-codex",
    "--watch-loop",
    "--watch-interval-ms",
    String(flags.watchIntervalMs ?? 1000),
    "--",
    ...command,
  ]);
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

async function proposeFromCli(args) {
  const flags = parseFlags(args);
  const payload = {
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
  };
  const daemon = await callDaemonApi("/api/authority/request", { method: "POST", body: payload });
  if (daemon.ok) {
    console.log("Transport: daemon");
    return printDecision(daemon.payload.decision);
  }
  if (daemon.attempted) console.log("Transport: local fallback");
  const next = store.update((state) =>
    proposeAction(state, payload),
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

function printQueueDecisionFromCli(args) {
  const [decisionId] = args;
  if (!decisionId) throw new Error("Usage: klemm queue inspect <decision-id>");
  const state = store.getState();
  const decision = state.decisions.find((item) => item.id === decisionId);
  if (!decision) throw new Error(`Decision not found: ${decisionId}`);
  console.log(renderDecisionDetail(decision, state));
}

async function recordQueueOutcome(args, outcome) {
  const flags = parseFlags(args);
  const positional = args.filter((item, index) => item !== "--to" && args[index - 1] !== "--to");
  const [decisionId, ...noteParts] = positional;
  if (!decisionId) throw new Error(`Usage: klemm ${outcome === "denied" ? "deny" : outcome} <decision-id> [note]`);
  const payload = {
    decisionId,
    outcome,
    note: noteParts.join(" "),
    rewrite: flags.to,
  };
  const daemon = await callDaemonApi("/api/queue/outcome", { method: "POST", body: payload });
  if (daemon.ok) {
    console.log("Transport: daemon");
    return printQueueOutcome(daemon.payload.queueItem);
  }
  if (daemon.attempted) console.log("Transport: local fallback");
  const next = store.update((state) =>
    recordQueuedDecision(state, payload),
  );
  const queued = next.queue.find((item) => item.id === decisionId);

  printQueueOutcome(queued);
}

function printQueueOutcome(queued) {
  console.log(`Decision recorded: ${queued.status}`);
  console.log(`Decision ID: ${queued.id}`);
  if (queued.rewrite) console.log(`Rewrite: ${queued.rewrite}`);
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

async function importMemorySourceFromCli(args) {
  const flags = parseFlags(args);
  const source = flags.source ?? flags.provider ?? "unknown";
  const payload = flags.text ?? (flags.file ? await readFile(flags.file, "utf8") : "");
  if (!payload) throw new Error("Usage: klemm memory import-source --source <provider> (--text <json-or-text> | --file <path>)");
  const next = store.update((state) =>
    importMemorySource(state, {
      source,
      sourceRef: flags.ref ?? flags.file ?? source,
      payload,
    }),
  );
  const memorySource = next.memorySources[0];
  console.log(`Memory source imported: ${memorySource.id}`);
  console.log(`Provider: ${memorySource.provider}`);
  console.log(`Messages: ${memorySource.messageCount}`);
  console.log(`Distilled: ${memorySource.distilledCount}`);
}

async function importContextSourceFromCli(args) {
  const flags = parseFlags(args);
  const provider = flags.provider ?? flags.source ?? "unknown";
  const sourceRef = flags.ref ?? flags.file ?? provider;
  const payload =
    flags.text ??
    (flags.file && !(provider === "chrome_history" || provider === "chrome-history") ? await readFile(flags.file, "utf8") : "");
  if (!payload && !flags.file) {
    throw new Error("Usage: klemm context import --provider <provider> (--text <text> | --file <path>)");
  }
  const next = store.update((state) =>
    importContextSource(state, {
      provider,
      sourceRef,
      payload,
      filePath: flags.file,
    }),
  );
  const memorySource = next.memorySources[0];

  console.log(`Context source imported: ${memorySource.id}`);
  console.log(`Provider: ${memorySource.provider}`);
  console.log(`Source: ${memorySource.sourceRef}`);
  console.log(`Records: ${memorySource.recordCount}`);
  console.log(`Distilled: ${memorySource.distilledCount}`);
  console.log(`Quarantined: ${memorySource.quarantinedCount}`);
}

function searchMemoryFromCli(args) {
  const flags = parseFlags(args);
  const query = flags.query ?? args.join(" ");
  const results = searchMemories(store.getState(), { query });
  console.log("Memory search");
  console.log(`Results: ${results.length}`);
  for (const memory of results.slice(0, 10)) {
    console.log(`- ${memory.id} [${memory.memoryClass}] ${memory.text}`);
  }
}

function printMemoryReview(args = []) {
  const flags = parseFlags(args);
  const state = store.getState();
  const pending = state.memories.filter((item) => item.status === "pending_review");
  console.log("Klemm memory review");
  if (flags.groupBySource) {
    const groups = groupBy(pending, (memory) => memory.source ?? "unknown");
    for (const [source, memories] of groups) {
      console.log(`Source: ${source}`);
      for (const memory of memories) printMemoryCandidate(memory);
    }
  } else {
    for (const memory of pending) printMemoryCandidate(memory);
  }
  for (const rejected of state.rejectedMemoryInputs.slice(0, 10)) {
    console.log(`- rejected ${rejected.id}: ${rejected.reason}`);
  }
  for (const quarantined of (state.memoryQuarantine ?? []).slice(0, 10)) {
    console.log(`- quarantined ${quarantined.id}: ${quarantined.reason} source=${quarantined.source}`);
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

function promoteMemoryPolicyFromCli(args) {
  const [memoryId] = args;
  const flags = parseFlags(args.slice(1));
  if (!memoryId) throw new Error("Usage: klemm memory promote-policy <memory-id> [--action-types a,b] [--target-includes x,y]");
  const next = store.update((state) =>
    promoteMemoryToPolicy(state, {
      memoryId,
      actionTypes: normalizeListFlag(flags.actionTypes),
      targetIncludes: normalizeListFlag(flags.targetIncludes),
      externalities: normalizeListFlag(flags.externalities),
      effect: flags.effect,
      severity: flags.severity,
    }),
  );
  const policy = next.policies[0];

  console.log(`Policy promoted: ${policy.id}`);
  console.log(`Source memory: ${policy.sourceMemoryId}`);
  console.log(`Effect: ${policy.effect}`);
  console.log(`Action types: ${policy.condition.actionTypes.join(",") || "any"}`);
  console.log(`Target includes: ${policy.condition.targetIncludes.join(",") || "any"}`);
}

function promoteBoundaryText(text, { source = "manual", note = "Promoted authority boundary." } = {}) {
  const distilled = store.update((state) =>
    distillMemory(state, {
      source,
      sourceRef: source,
      text,
    }),
  );
  const memory = distilled.memories[0];
  if (!memory) return null;
  const reviewed = store.update((state) =>
    reviewMemory(state, {
      memoryId: memory.id,
      status: "approved",
      note,
    }),
  );
  const policyState = store.update((state) =>
    promoteMemoryToPolicy(state, {
      memoryId: memory.id,
      actionTypes: inferPolicyActionTypes(text),
      targetIncludes: inferPolicyTargetIncludes(text),
      note,
    }),
  );
  const policy = policyState.policies[0];
  console.log(`Memory reviewed: ${reviewed.memories.find((item) => item.id === memory.id)?.id} approved`);
  console.log(`Policy promoted: ${policy.id}`);
  return policy;
}

function inferPolicyActionTypes(text) {
  const value = String(text ?? "").toLowerCase();
  if (/push|github/.test(value)) return ["git_push"];
  if (/deploy|production|prod/.test(value)) return ["deployment"];
  if (/send|email|post|publish/.test(value)) return ["external_send"];
  if (/oauth/.test(value)) return ["oauth_scope_change"];
  if (/credential|secret|token/.test(value)) return ["credential_change"];
  if (/delete|remove/.test(value)) return ["delete_data"];
  return [];
}

function inferPolicyTargetIncludes(text) {
  const value = String(text ?? "").toLowerCase();
  const targets = [];
  if (/github/.test(value)) targets.push("github", "origin");
  if (/production/.test(value)) targets.push("production");
  if (/\bprod\b/.test(value)) targets.push("prod");
  if (/email/.test(value)) targets.push("email");
  return [...new Set(targets)];
}

function recordWatchPath(path, { kind = "path" } = {}) {
  const now = new Date().toISOString();
  store.update((state) => ({
    ...state,
    watchPaths: [
      {
        id: `watch-${Date.now()}`,
        path,
        kind,
        createdAt: now,
      },
      ...(state.watchPaths ?? []).filter((item) => item.path !== path),
    ],
  }));
}

function printUserModel(args) {
  const flags = parseFlags(args);
  const summary = buildUserModelSummary(store.getState(), {
    includePending: flags.pending !== false,
  });
  console.log(summary.text);
}

function addSyncSourceFromCli(args) {
  const flags = parseFlags(args);
  if (!flags.id || !flags.provider || !flags.path) {
    throw new Error("Usage: klemm sync add --id <id> --provider <provider> --path <path>");
  }
  const next = store.update((state) =>
    addContextSyncSource(state, {
      id: flags.id,
      provider: flags.provider,
      path: flags.path,
      sourceRef: flags.ref ?? flags.path,
      intervalMinutes: flags.intervalMinutes,
      nextRunAt: flags.nextRunAt,
      now: flags.now,
    }),
  );
  const source = next.contextSyncSources.find((item) => item.id === flags.id);
  console.log(`Sync source added: ${source.id}`);
  console.log(`Provider: ${source.provider}`);
  console.log(`Path: ${source.path}`);
  if (source.intervalMinutes) console.log(`Interval minutes: ${source.intervalMinutes}`);
  if (source.nextRunAt) console.log(`Next run: ${source.nextRunAt}`);
}

function printContextSyncPlan(args) {
  const flags = parseFlags(args);
  const plan = buildContextSyncPlan(store.getState(), {
    id: flags.id,
    now: flags.now,
  });
  console.log("Context sync plan");
  console.log(`Now: ${plan.now}`);
  console.log(`Sources: ${plan.planned.length}`);
  console.log(`Due sources: ${plan.due.length}`);
  for (const item of plan.planned) {
    console.log(`- ${item.sourceId} ${item.reason} next=${item.nextRunAt} interval=${item.intervalMinutes}`);
  }
}

async function onboardFromCli(args) {
  const flags = parseFlags(args);
  if (!flags.stdin) {
    console.log("Klemm onboarding");
    console.log("Run with --stdin to provide answers non-interactively.");
    console.log("Prompts: authority boundary, watch path, Codex history path, working preference, approve yes/no.");
    return;
  }
  const answers = (await readStdin()).split(/\r?\n/).map((line) => line.trim());
  const [boundary, watchPath, codexHistory, preference, approveAnswer] = answers;
  const approve = /^y(es)?$/i.test(approveAnswer ?? "");

  console.log("Klemm onboarding");
  if (boundary) promoteBoundaryText(boundary, { source: "onboarding", note: "Onboarding authority boundary." });
  if (watchPath) {
    recordWatchPath(watchPath, { kind: "repo" });
    console.log(`Watch path added: ${watchPath}`);
  }
  if (codexHistory) {
    addSyncSourceFromCli(["--id", "codex-history", "--provider", "codex", "--path", codexHistory]);
  }
  if (preference) {
    const next = store.update((state) =>
      distillMemory(state, {
        source: "onboarding",
        sourceRef: "onboarding",
        text: preference,
      }),
    );
    const memory = next.memories[0];
    if (approve && memory) {
      store.update((state) => reviewMemory(state, { memoryId: memory.id, status: "approved", note: "Approved during onboarding." }));
      console.log(`Memory reviewed: ${memory.id} approved`);
    }
  }
  store.update((state) => ({
    ...state,
    onboardingProfiles: [
      {
        id: `onboarding-${Date.now()}`,
        authorityBoundary: boundary,
        watchPath,
        codexHistory,
        preference,
        approvedPreference: approve,
        createdAt: new Date().toISOString(),
      },
      ...(state.onboardingProfiles ?? []),
    ],
  }));
  console.log("Onboarding complete");
}

async function onboardV2FromCli(args) {
  const flags = parseFlags(args);
  if (!flags.stdin) {
    console.log("Klemm onboarding v2");
    console.log("Run with --stdin. Prompts: mode, chat history path, watch path, agents, approve yes/no.");
    return;
  }
  const answers = (await readStdin()).split(/\r?\n/).map((line) => line.trim());
  const [mode = "coding-afk", chatHistoryPath, watchPath, agentsText = "codex", approveAnswer] = answers;
  const agents = normalizeListFlag(agentsText);
  const approve = /^y(es)?$/i.test(approveAnswer ?? "");

  console.log("Klemm onboarding v2");
  console.log(`Default mode: ${mode}`);
  policyPackFromCli(["apply", mode]);

  if (chatHistoryPath) {
    addSyncSourceFromCli(["--id", "chatgpt-history", "--provider", "chatgpt", "--path", chatHistoryPath]);
    await importContextSourceFromCli(["--provider", "chatgpt", "--file", chatHistoryPath]);
  }
  if (watchPath) {
    recordWatchPath(watchPath, { kind: "repo" });
    console.log(`Watch path added: ${watchPath}`);
  }

  const profilesPath = flags.profiles ?? join(KLEMM_DATA_DIR, "profiles", "default-profiles.json");
  await writeDefaultProfiles(profilesPath, { agents, dataDir: KLEMM_DATA_DIR });
  console.log(`Agent wrappers: ${agents.join(",")}`);
  console.log(`Default profiles: ${profilesPath}`);

  let approvedCount = 0;
  if (approve) {
    const pending = store.getState().memories.filter((memory) => memory.status === "pending_review").slice(0, Number(flags.approveLimit ?? 5));
    for (const memory of pending) {
      store.update((state) => reviewMemory(state, { memoryId: memory.id, status: "approved", note: "Approved during onboarding v2." }));
      approvedCount += 1;
    }
  }
  console.log(`Approved first memory candidates: ${approvedCount}`);

  store.update((state) => ({
    ...state,
    onboardingProfiles: [
      {
        id: `onboarding-v2-${Date.now()}`,
        mode,
        chatHistoryPath,
        watchPath,
        agents,
        approvedFirstCandidates: approvedCount,
        createdAt: new Date().toISOString(),
      },
      ...(state.onboardingProfiles ?? []),
    ],
  }));
  console.log("Klemm onboarding v2 complete");
}

async function runContextSyncFromCli(args) {
  const flags = parseFlags(args);
  const state = store.getState();
  const plan = buildContextSyncPlan(state, { id: flags.id, now: flags.now });
  const sources = flags.due
    ? plan.due.map((item) => item.source)
    : (state.contextSyncSources ?? []).filter((source) => source.enabled !== false && (!flags.id || source.id === flags.id));
  let imported = 0;
  let skipped = 0;
  let quarantined = 0;
  let scheduled = 0;
  for (const source of sources) {
    const result = await syncOneSource(source, { dueRun: Boolean(flags.due), now: flags.now });
    imported += result.imported ? 1 : 0;
    skipped += result.skipped ? 1 : 0;
    quarantined += result.quarantinedCount;
    scheduled += result.nextRunAt ? 1 : 0;
  }
  console.log("Context sync complete");
  console.log(`Sources: ${sources.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped unchanged: ${skipped}`);
  console.log(`Quarantined: ${quarantined}`);
  console.log(`Scheduled next: ${scheduled}`);
}

async function syncOneSource(source, { dueRun = false, now } = {}) {
  const startedAt = now ?? new Date().toISOString();
  const buffer = await readFile(source.path);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const nextRunAt = computeNextRunAt(source, startedAt);
  if (checksum === source.lastChecksum) {
    const runState = store.update((state) =>
      recordContextSyncRun(state, {
        sourceId: source.id,
        provider: source.provider,
        sourceRef: source.sourceRef,
        status: "skipped_unchanged",
        checksum,
        skippedCount: 1,
        dueRun,
        nextRunAt,
        startedAt,
      }),
    );
    const run = runState.contextSyncRuns[0];
    store.update((state) =>
      updateContextSyncSource(state, source.id, {
        lastRunId: run.id,
        nextRunAt,
      }),
    );
    return { skipped: true, quarantinedCount: 0, nextRunAt };
  }

  const snapshotPath = await snapshotSyncSource(source, buffer);
  const before = store.getState();
  const importedState = store.update((state) =>
    importContextSource(state, {
      provider: source.provider,
      sourceRef: source.sourceRef ?? source.path,
      payload: source.provider === "chrome_history" ? "" : buffer.toString("utf8"),
      filePath: source.provider === "chrome_history" ? snapshotPath : undefined,
    }),
  );
  const memorySource = importedState.memorySources[0];
  const runState = store.update((state) =>
    recordContextSyncRun(state, {
      sourceId: source.id,
      provider: source.provider,
      sourceRef: source.sourceRef,
      status: "imported",
      checksum,
      importedCount: 1,
      distilledCount: importedState.memories.length - before.memories.length,
      quarantinedCount: memorySource.quarantinedCount ?? 0,
      snapshotPath,
      dueRun,
      nextRunAt,
      startedAt,
    }),
  );
  const run = runState.contextSyncRuns[0];
  store.update((state) =>
    updateContextSyncSource(state, source.id, {
      lastChecksum: checksum,
      lastImportedAt: run.finishedAt,
      lastRunId: run.id,
      nextRunAt,
    }),
  );
  return { imported: true, quarantinedCount: memorySource.quarantinedCount ?? 0, nextRunAt };
}

function computeNextRunAt(source, now) {
  const intervalMinutes = Number(source.intervalMinutes ?? 0);
  if (intervalMinutes <= 0) return undefined;
  return new Date(Date.parse(now) + intervalMinutes * 60_000).toISOString();
}

async function snapshotSyncSource(source, buffer) {
  const snapshotsDir = join(KLEMM_DATA_DIR, "sync-snapshots");
  await mkdir(snapshotsDir, { recursive: true });
  const suffix = source.provider === "chrome_history" ? ".sqlite" : ".txt";
  const snapshotPath = join(snapshotsDir, `${source.id}-${Date.now()}${suffix}`);
  if (source.provider === "chrome_history") {
    await copyFile(source.path, snapshotPath);
  } else {
    await writeFile(snapshotPath, buffer);
  }
  return snapshotPath;
}

function printSyncStatus(args) {
  const flags = parseFlags(args);
  const state = store.getState();
  const sources = (state.contextSyncSources ?? []).filter((source) => !flags.id || source.id === flags.id);
  console.log("Context sync status");
  if (sources.length === 0) {
    console.log("No sync sources configured.");
    return;
  }
  for (const source of sources) {
    console.log(
      `- ${source.id} ${source.provider} path=${source.path} enabled=${source.enabled !== false} lastImported=${source.lastImportedAt ?? "never"} lastRun=${source.lastRunId ?? "none"}`,
    );
  }
  for (const run of (state.contextSyncRuns ?? []).slice(0, 8)) {
    console.log(`- run ${run.id} source=${run.sourceId} status=${run.status} distilled=${run.distilledCount} quarantined=${run.quarantinedCount}`);
  }
}

async function printDebrief(args) {
  const flags = parseFlags(args);
  const path = `/api/debrief${flags.mission ? `?mission=${encodeURIComponent(flags.mission)}` : ""}`;
  const daemon = await callDaemonApi(path, { method: "GET" });
  if (daemon.ok) {
    console.log("Transport: daemon");
    console.log(daemon.payload.debrief);
    return;
  }
  if (daemon.attempted) console.log("Transport: local fallback");
  console.log(summarizeDebrief(store.getState(), { missionId: flags.mission }));
}

function printDogfoodStatus(args) {
  const flags = parseFlags(args);
  console.log("Klemm dogfood status");
  console.log(renderKlemmDashboard(store.getState(), { missionId: flags.mission }));
}

async function printTui(args) {
  const flags = parseFlags(args);
  console.log(renderTuiView(store.getState(), { missionId: flags.mission, view: flags.view ?? "overview", logFile: flags.logFile, decision: flags.decision }));
  if (!flags.interactive) return;

  console.log("Interactive Klemm TUI");
  console.log("Commands: tab <overview|memory|queue|agents|policies|model|logs>, model, approve|deny <decision-id> [note], memory approve|reject|pin <memory-id> [note], quit");
  const input = await readStdin();
  for (const line of input.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    if (line === "quit" || line === "exit") {
      console.log("bye");
      return;
    }
    const [command, subcommand, id, ...noteParts] = splitShellLike(line);
    if (command === "tab") {
      console.log(renderTuiView(store.getState(), { missionId: flags.mission, view: subcommand ?? "overview", logFile: flags.logFile, decision: flags.decision }));
      continue;
    }
    if (command === "model") {
      console.log(buildUserModelSummary(store.getState()).text);
      continue;
    }
    if (command === "inspect") {
      console.log(renderDecisionDetail(store.getState().decisions.find((item) => item.id === subcommand), store.getState()));
      continue;
    }
    if (command === "approve" || command === "deny" || command === "rewrite") {
      await recordQueueOutcome([subcommand, id, ...noteParts].filter(Boolean), command === "deny" ? "denied" : command === "approve" ? "approved" : "rewritten");
      continue;
    }
    if (command === "memory" && ["approve", "reject", "pin"].includes(subcommand)) {
      reviewMemoryFromCli([id, ...noteParts], memoryCommandToStatus(subcommand));
      continue;
    }
    console.log(`Unknown interactive command: ${line}`);
  }
}

function renderTuiView(state, { missionId, view = "overview", logFile, decision: decisionId } = {}) {
  const normalized = String(view ?? "overview").toLowerCase();
  const header = ["Klemm TUI", `View: ${normalized}`];
  if (normalized === "overview") return [...header, renderKlemmDashboard(state, { missionId })].join("\n");
  if (normalized === "memory") {
    return [
      ...header,
      "Memory Review",
      ...(state.memories ?? []).slice(0, 12).map((memory) => `- ${memory.id} ${memory.status} [${memory.memoryClass}] ${memory.text}`),
      "Quarantine",
      ...((state.memoryQuarantine ?? []).slice(0, 8).map((item) => `- ${item.id} ${item.reason}: ${oneLine(item.text)}`)),
    ].join("\n");
  }
  if (normalized === "queue") {
    const queue = (state.queue ?? []).filter((item) => item.status === "queued");
    return [...header, "Queue", ...(queue.length ? queue.map((item) => `- ${item.id} ${item.riskLevel} ${item.actionType} ${item.target}`) : ["- none"])].join("\n");
  }
  if (normalized === "agents") {
    return [
      ...header,
      "Agents",
      ...((state.agents ?? []).map((agent) => `- ${agent.id} ${agent.status} mission=${agent.missionId} kind=${agent.kind}`)),
      "Monitor",
      ...((state.alignmentReports ?? []).slice(0, 8).map((report) => `- ${report.id} ${report.state}: ${report.reason}`)),
    ].join("\n");
  }
  if (normalized === "policies") {
    return [
      ...header,
      "Policies",
      ...((state.policies ?? []).map((policy) => `- ${policy.id} ${policy.effect} ${policy.name ?? policy.text ?? policy.source ?? ""}`)),
    ].join("\n");
  }
  if (normalized === "model") return [...header, buildUserModelSummary(state).text].join("\n");
  if (normalized === "logs") {
    return [...header, "Logs", `Log file: ${logFile ?? join(KLEMM_DATA_DIR, "logs", "klemm-daemon.log")}`].join("\n");
  }
  if (normalized === "trust" || normalized === "decision") {
    const decision = state.decisions.find((item) => item.id === decisionId) ?? state.decisions[0];
    return [...header, renderDecisionDetail(decision, state)].join("\n");
  }
  return [...header, `Unknown view: ${view}`].join("\n");
}

function renderDecisionDetail(decision, state = store.getState()) {
  if (!decision) return "Decision Detail\n- none";
  const sourceMemoryIds = (decision.matchedPolicies ?? []).map((policy) => policy.sourceMemoryId).filter(Boolean);
  const sourceMemories = (state.memories ?? []).filter((memory) => sourceMemoryIds.includes(memory.id));
  const suggestedRewrite = decision.rewrite ?? decision.proposal?.suggestedRewrite;
  return [
    "Decision Detail",
    `${decision.id} ${decision.decision} ${decision.riskLevel} score=${decision.riskScore ?? "n/a"}`,
    `Actor: ${decision.actor}`,
    `Action: ${decision.actionType} ${redactSensitiveText(decision.target)}`,
    `Reason: ${redactSensitiveText(decision.reason)}`,
    `Suggested rewrite: ${suggestedRewrite || "none"}`,
    "Risk factors:",
    ...((decision.riskFactors ?? []).length
      ? decision.riskFactors.map((factor) => `- ${factor.id}: ${factor.label ?? factor.reason ?? factor.weight ?? ""}`)
      : ["- none"]),
    "Matched policies:",
    ...((decision.matchedPolicies ?? []).length
      ? decision.matchedPolicies.map((policy) => `- ${policy.id}: ${redactSensitiveText(policy.name ?? policy.text ?? policy.source ?? "")}`)
      : ["- none"]),
    "Source memories:",
    ...(sourceMemories.length
      ? sourceMemories.map((memory) => `- ${memory.id} ${memory.status}: ${redactSensitiveText(memory.text)}`)
      : ["- none"]),
    "Source evidence:",
    ...(sourceMemories.length
      ? sourceMemories.map((memory) => `- ${memory.id} source=${memory.source} ref=${memory.sourceRef ?? memory.evidence?.sourceRef ?? "unknown"} provider=${memory.evidence?.provider ?? memory.source}`)
      : ["- none"]),
    "Explanation:",
    redactSensitiveText(decision.explanation?.summary ?? decision.reason ?? "No explanation recorded."),
  ].join("\n");
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
    const result = await runSupervisedProcess(splitShellLike(decision.rewrite), {
      cwd: commandCwd,
      capture: flags.capture,
      missionId: flags.mission,
      watchLoop: flags.watchLoop,
      watchIntervalMs: flags.watchIntervalMs,
      recordTree: flags.recordTree,
      timeoutMs: flags.timeoutMs,
      onLiveOutput: flags.interceptOutput ? buildLiveOutputInterceptor(flags) : null,
    });
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

  const result = await runSupervisedProcess(command, {
    cwd: commandCwd,
    capture: flags.capture,
    missionId: flags.mission,
    watchLoop: flags.watchLoop,
    watchIntervalMs: flags.watchIntervalMs,
    recordTree: flags.recordTree,
    timeoutMs: flags.timeoutMs,
    onLiveOutput: flags.interceptOutput ? buildLiveOutputInterceptor(flags) : null,
  });
  if (flags.capture) persistCapturedRun(flags, target, result, commandCwd);
  if (flags.watch || flags.watchLoop) recordAndPrintAlignment(flags, {
    actor: flags.actor ?? "supervised_process",
    command: target,
    result,
  });
  console.log(`Klemm supervised exit: ${result.status}`);
  process.exitCode = result.status;
}

async function runRuntimeFromCli(args) {
  const profileName = args[0];
  const rest = args.slice(1);
  const separator = rest.indexOf("--");
  const flagArgs = separator >= 0 ? rest.slice(0, separator) : rest;
  const runtimeArgs = separator >= 0 ? rest.slice(separator + 1) : [];
  const flags = parseFlags(flagArgs);
  const profile = await loadRuntimeProfile(profileName, flags.profileFile);
  if (!profile) throw new Error(`Usage: klemm run <${Object.keys(AGENT_RUNTIME_PROFILES).join("|")}> [--profile-file path] [--mission <id>] [--dry-run] -- [args...]`);
  const missionId = flags.mission ?? profile.defaultMission?.id;
  if (!flags.mission && profile.defaultMission) {
    store.update((state) =>
      startMission(state, {
        id: profile.defaultMission.id,
        hub: profile.defaultMission.hub ?? profileName,
        goal: profile.defaultMission.goal,
        allowedActions: profile.defaultMission.allowedActions,
        blockedActions: [...new Set([...(profile.defaultMission.blockedActions ?? []), ...(profile.authority?.blockedActions ?? [])])],
        rewriteAllowed: profile.defaultMission.rewriteAllowed,
        escalationChannel: profile.defaultMission.escalationChannel,
      }),
    );
    console.log(`Default mission started: ${profile.defaultMission.id}`);
  }
  if (profile.adapterClientId && profile.adapterToken) {
    store.update((state) =>
      addAdapterClient(state, {
        id: profile.adapterClientId,
        token: profile.adapterToken,
        protocolVersions: profile.protocolVersions ?? [profile.protocolVersion ?? 1],
      }),
    );
    console.log(`Adapter client ensured: ${profile.adapterClientId}`);
  }
  const command = profile.command.length > 0 ? [...profile.command, ...runtimeArgs] : runtimeArgs;
  if (command.length === 0) throw new Error(`Usage: klemm run ${profileName} [--mission <id>] -- <command> [args...]`);

  const commandCwd = flags.cwd ?? process.cwd();
  const withAgent = store.update((state) =>
    registerAgent(state, {
      id: flags.agentId ?? profile.agentId,
      missionId,
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
        missionId,
        actor: agent.id,
        suggestedRewrite: flags.rewriteTo,
      }),
    ),
  );
  const decision = withDecision.decisions[0];

  console.log(`Agent runtime profile: ${profileName}`);
  if (flags.profileFile) console.log(`Runtime profile loaded: ${profileName}`);
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
  const result = await runSupervisedProcess(commandToRun, {
    cwd: commandCwd,
    capture: flags.capture,
    recordTree: flags.recordTree,
    timeoutMs: flags.timeoutMs,
    env: buildRuntimeEnv(profile),
  });
  if (flags.capture) persistCapturedRun({ ...flags, mission: missionId }, commandToRun.join(" "), result, commandCwd);
  console.log(`Klemm runtime exit: ${result.status}`);
  process.exitCode = result.status;
}

async function loadRuntimeProfile(profileName, profileFile) {
  let profiles = { ...AGENT_RUNTIME_PROFILES };
  if (profileFile) {
    const parsed = JSON.parse(await readFile(profileFile, "utf8"));
    for (const [name, profile] of Object.entries(parsed.profiles ?? {})) {
      const base = profiles[profile.extends] ?? {};
      profiles[name] = {
        ...base,
        ...profile,
        command: profile.command ?? base.command ?? [],
      };
    }
  }
  return profiles[profileName];
}

async function writeDefaultProfiles(profilesPath, { agents = ["codex", "claude", "shell"], dataDir = KLEMM_DATA_DIR } = {}) {
  await mkdir(dirname(profilesPath), { recursive: true });
  const profiles = {};
  for (const agent of agents) {
    profiles[agent] = buildProfileTemplate(agent, { dataDir });
  }
  await writeFile(profilesPath, `${JSON.stringify({ profiles }, null, 2)}\n`, "utf8");
  return profilesPath;
}

async function withCapturedConsole(callback) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...values) => {
    lines.push(values.join(" "));
  };
  try {
    const value = await callback();
    return { value, lines };
  } finally {
    console.log = originalLog;
  }
}

function buildProfileTemplate(agent = "codex", { dataDir = KLEMM_DATA_DIR } = {}) {
  const normalized = String(agent ?? "codex").toLowerCase();
  if (normalized === "claude") {
    return {
      extends: "claude",
      agentId: "agent-runtime-claude",
      name: "Claude Code",
      defaultMission: { id: "mission-claude-afk", goal: "Supervise Claude Code while the user is away.", blockedActions: ["git_push", "deployment", "external_send"] },
      adapterClientId: "claude-local",
      adapterToken: "${KLEMM_ADAPTER_TOKEN}",
      protocolVersions: [2],
      env: { KLEMM_PROFILE_NAME: "claude", KLEMM_DATA_DIR: dataDir },
    };
  }
  if (normalized === "shell") {
    return {
      extends: "shell",
      agentId: "agent-runtime-shell",
      name: "Shell Agent",
      command: [],
      defaultMission: { id: "mission-shell-afk", goal: "Supervise shell agent work while the user is away.", blockedActions: ["git_push", "deployment", "external_send"] },
      env: { KLEMM_PROFILE_NAME: "shell", KLEMM_DATA_DIR: dataDir },
    };
  }
  return {
    extends: "codex",
    agentId: "agent-runtime-codex",
    name: "Codex",
    defaultMission: { id: "mission-codex-afk", goal: "Supervise Codex while the user is away.", blockedActions: ["git_push", "deployment", "external_send", "credential_change"] },
    adapterClientId: "codex-local",
    adapterToken: "${KLEMM_ADAPTER_TOKEN}",
    protocolVersions: [2],
    env: { KLEMM_PROFILE_NAME: "codex", KLEMM_DATA_DIR: dataDir },
  };
}

function buildRuntimeEnv(profile = {}) {
  return {
    ...process.env,
    ...(profile.env ?? {}),
    ...(profile.adapterClientId ? { KLEMM_ADAPTER_CLIENT_ID: profile.adapterClientId } : {}),
    ...(profile.adapterToken ? { KLEMM_ADAPTER_TOKEN: profile.adapterToken } : {}),
    ...(profile.protocolVersion ? { KLEMM_PROTOCOL_VERSION: String(profile.protocolVersion) } : {}),
  };
}

async function runSupervisedProcess(command, {
  cwd = process.cwd(),
  capture = false,
  watchLoop = false,
  watchIntervalMs = 1000,
  recordTree = false,
  timeoutMs,
  env = process.env,
  onLiveOutput = null,
} = {}) {
  const startedAt = new Date().toISOString();
  const beforeSnapshot = capture ? await snapshotFiles(cwd) : new Map();
  const started = Date.now();
  const output = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let heartbeat;
    let timeout;
    let terminationSignal;
    let timedOut = false;
    const processTree = recordTree
      ? [
          {
            pid: child.pid,
            command: command.join(" "),
            relationship: "root",
          },
        ]
      : [];
    if (watchLoop) {
      const interval = Math.max(25, Number(watchIntervalMs ?? 1000));
      heartbeat = setInterval(() => {
        const elapsedMs = Date.now() - started;
        process.stdout.write(`Klemm heartbeat: ${elapsedMs}ms elapsed for ${command.join(" ")}\n`);
      }, interval);
    }
    if (timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        terminationSignal = "SIGTERM";
        process.stdout.write(`Klemm timeout intervention: ${timeoutMs}ms elapsed for ${command.join(" ")}\n`);
        child.kill("SIGTERM");
      }, Number(timeoutMs));
    }
    let stdout = "";
    let stderr = "";
    let liveIntervention = null;
    const handleOutput = (stream, chunk) => {
      const text = chunk.toString();
      if (stream === "stdout") {
        stdout += text;
        process.stdout.write(chunk);
      } else {
        stderr += text;
        process.stderr.write(chunk);
      }
      if (!onLiveOutput || liveIntervention) return;
      liveIntervention = onLiveOutput({
        stream,
        text,
        transcript: `${stdout}\n${stderr}`,
        command: command.join(" "),
      });
      if (liveIntervention) {
        terminationSignal = "SIGTERM";
        process.stdout.write(`Klemm live intervention: ${liveIntervention.decision.decision} ${liveIntervention.decision.actionType} ${liveIntervention.decision.id}\n`);
        child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", (chunk) => {
      handleOutput("stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      handleOutput("stderr", chunk);
    });
    child.on("error", (error) => {
      if (heartbeat) clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
      if (error.code === "ENOENT") {
        const stderr = buildMissingCommandMessage(command[0]);
        process.stdout.write(`${stderr}\n`);
        resolve({
          status: 127,
          stdout: "",
          stderr,
          pid: child.pid,
          processTree,
          terminationSignal,
          timedOut,
          liveInterventions: [],
        });
        return;
      }
      reject(error);
    });
    child.on("close", (status, signal) => {
      if (heartbeat) clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
      resolve({
        status: liveIntervention || timedOut ? 2 : status ?? 1,
        stdout,
        stderr,
        pid: child.pid,
        processTree,
        terminationSignal: terminationSignal ?? signal,
        timedOut,
        liveInterventions: liveIntervention ? [liveIntervention] : [],
      });
    });
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

function resolveDefaultCodexCommand(flags = {}) {
  if (flags.codexCommand) return splitShellLike(flags.codexCommand);
  if (process.env.KLEMM_CODEX_COMMAND) return splitShellLike(process.env.KLEMM_CODEX_COMMAND);
  const appBundleCodex = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(appBundleCodex)) return [appBundleCodex];
  return ["codex"];
}

function buildMissingCommandMessage(commandName) {
  if (commandName === "codex" || String(commandName).includes("/Codex.app/")) {
    return [
      `Klemm could not find command: ${commandName}`,
      "Set KLEMM_CODEX_COMMAND to your Codex CLI path, or run klemm codex wrap -- <command>.",
      "Example: export KLEMM_CODEX_COMMAND=\"/Applications/Codex.app/Contents/Resources/codex\"",
    ].join("\n");
  }
  return [
    `Klemm could not find command: ${commandName}`,
    "Check that the command exists and is available on PATH, or pass an absolute path.",
    "Set KLEMM_CODEX_COMMAND for Codex wrapper sessions, or run klemm codex wrap -- <command>.",
  ].join("\n");
}

function buildLiveOutputInterceptor(flags) {
  return ({ text, transcript }) => {
    const proposal = buildLiveOutputProposal(text, transcript, {
      missionId: flags.mission,
      actor: flags.actor ?? "supervised_process",
    });
    if (!proposal) return null;
    const next = store.update((state) => proposeAction(state, proposal));
    return {
      decision: next.decisions[0],
      matchedText: oneLine(text),
    };
  };
}

function buildLiveOutputProposal(text, transcript, { missionId, actor } = {}) {
  const haystack = `${text}\n${transcript}`;
  if (/\bgit\s+push\b/i.test(haystack)) {
    return {
      id: `live-output-${Date.now()}`,
      missionId,
      actor,
      actionType: "git_push",
      target: oneLine(text),
      externality: "git_push",
      missionRelevance: "related",
    };
  }
  if (/\bdeploy\b.*\b(prod|production)\b|\b(vercel|netlify|fly|railway)\b.*\bdeploy\b/i.test(haystack)) {
    return {
      id: `live-output-${Date.now()}`,
      missionId,
      actor,
      actionType: "deployment",
      target: oneLine(text),
      externality: "deployment",
      missionRelevance: "related",
    };
  }
  if (looksLikeCliHelpText(haystack)) return null;
  if (looksLikeCredentialAction(haystack)) {
    return {
      id: `live-output-${Date.now()}`,
      missionId,
      actor,
      actionType: /oauth/i.test(haystack) ? "oauth_scope_change" : "credential_change",
      target: oneLine(text),
      externality: "credential_surface",
      credentialImpact: true,
      missionRelevance: "related",
    };
  }
  if (/\brm\s+-rf\b|\bdelete\b.*\b(production|database|bucket|account)\b/i.test(haystack)) {
    return {
      id: `live-output-${Date.now()}`,
      missionId,
      actor,
      actionType: "delete_data",
      target: oneLine(text),
      externality: "local_only",
      missionRelevance: "related",
    };
  }
  return null;
}

function looksLikeCliHelpText(text) {
  return /\bUsage:\s+\S+/i.test(text) || /\b(Options|Commands|Arguments):/i.test(text);
}

function looksLikeCredentialAction(text) {
  const credential = "(secret|token|credential|api[-_ ]?key|oauth)";
  const verb = "(set|create|update|change|rotate|delete|revoke|write|save|store|export|print|leak|send|submit|grant)";
  return new RegExp(`\\b${verb}\\b.{0,120}\\b${credential}\\b|\\b${credential}\\b.{0,120}\\b${verb}\\b`, "i").test(text);
}

function persistCapturedRun(flags, command, result, cwd) {
  const next = store.update((state) =>
    recordSupervisedRun(state, {
      missionId: flags.mission,
      command,
      cwd,
      pid: result.pid,
      processTree: result.processTree,
      terminationSignal: result.terminationSignal,
      timedOut: result.timedOut,
      exitCode: result.status,
      durationMs: result.durationMs,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      fileChanges: result.fileChanges,
      liveInterventions: result.liveInterventions,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    }),
  );
  console.log(`Capture ID: ${next.supervisedRuns[0].id}`);
}

function printSupervisedRuns(args = []) {
  const flags = parseFlags(args);
  const runs = store.getState().supervisedRuns ?? [];
  console.log("Supervised runs");
  if (runs.length === 0) {
    console.log("No supervised runs captured.");
    return;
  }
  for (const run of runs) {
    const detail = flags.details
      ? ` pid=${run.pid ?? "unknown"} tree=${run.processTree?.length ?? 0} termination=${run.terminationSignal ?? "none"} interventions=${run.liveInterventions?.length ?? 0}`
      : "";
    console.log(
      `- ${run.id} mission=${run.missionId ?? "none"} exit=${run.exitCode} durationMs=${run.durationMs}${detail} files=${run.fileChanges.join(",") || "none"} stdout=${oneLine(run.stdout)} stderr=${oneLine(run.stderr)}`,
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

function addPolicyFromCli(args) {
  const flags = parseFlags(args);
  const next = store.update((state) =>
    addStructuredPolicy(state, {
      id: flags.id,
      name: flags.name,
      effect: flags.effect ?? "queue",
      severity: flags.severity ?? "medium",
      source: flags.source ?? "manual",
      condition: {
        actionTypes: flags.actionTypes,
        targetIncludes: flags.targetIncludes,
        externalities: flags.externalities,
      },
    }),
  );
  const policy = next.policies[0];
  console.log(`Policy added: ${policy.id}`);
  console.log(`Effect: ${policy.effect}`);
  console.log(`Severity: ${policy.severity}`);
}

function policyPackFromCli(args) {
  const action = args[0] ?? "list";
  if (action === "list") {
    console.log("Policy packs");
    for (const [name, policies] of Object.entries(POLICY_PACKS)) {
      console.log(`- ${name} (${policies.length} policies)`);
    }
    return;
  }
  if (action !== "apply") throw new Error("Usage: klemm policy pack list|apply <pack-name>");
  const packName = args[1];
  const flags = parseFlags(args.slice(2));
  const pack = POLICY_PACKS[packName];
  if (!pack) throw new Error(`Unknown policy pack: ${packName}`);
  let next = store.getState();
  for (const policy of pack) {
    next = addStructuredPolicy(next, {
      id: `${packName}-${policy.id}`,
      name: policy.name,
      effect: policy.effect ?? "queue",
      severity: policy.severity ?? "medium",
      source: "policy_pack",
      sourceRef: packName,
      condition: {
        actionTypes: policy.actionTypes,
        targetIncludes: policy.targetIncludes,
        externalities: policy.externalities,
      },
    });
  }
  store.saveState(next);
  console.log(`Policy pack applied: ${packName}`);
  console.log(`Policies added: ${pack.length}`);
  if (flags.mission) console.log(`Mission hint: ${flags.mission}`);
}

function simulatePolicyFromCli(args) {
  const flags = parseFlags(args);
  const simulation = simulatePolicyDecision(store.getState(), {
    missionId: flags.mission,
    actor: flags.actor,
    actionType: flags.type ?? flags.actionType,
    target: flags.target,
    externality: flags.external,
    reversibility: flags.reversibility,
    privacyExposure: flags.privacy,
    moneyImpact: flags.money,
    legalImpact: flags.legal,
    reputationImpact: flags.reputation,
    credentialImpact: flags.credential,
    missionRelevance: flags.relevance ?? "related",
  });
  console.log("Policy simulation");
  console.log(`Decision: ${simulation.decision}`);
  console.log(`Risk: ${simulation.riskLevel}`);
  console.log(`Risk score: ${simulation.riskScore}`);
  console.log(`Action category: ${simulation.actionCategory}`);
  console.log(`Reason: ${simulation.reason}`);
  console.log(`Matched policies: ${simulation.matchedPolicies.map((policy) => policy.id).join(",") || "none"}`);
  console.log(`Risk factors: ${simulation.riskFactors.map((factor) => factor.id).join(",") || "none"}`);
}

function addAdapterTokenFromCli(args) {
  const flags = parseFlags(args);
  if (!flags.id || !flags.token) throw new Error("Usage: klemm adapter token add --id <client-id> --token <token> [--versions 1,2]");
  const next = store.update((state) =>
    addAdapterClient(state, {
      id: flags.id,
      token: flags.token,
      protocolVersions: flags.versions,
      permissions: flags.permissions,
    }),
  );
  const client = next.adapterClients[0];
  console.log(`Adapter client added: ${client.id}`);
  console.log(`Protocol versions: ${client.protocolVersions.join(",")}`);
  console.log(`Permissions: ${client.permissions.join(",")}`);
}

function renderLaunchAgentFromCli(args) {
  const flags = parseFlags(args);
  console.log(renderLaunchAgentPlist({
    label: flags.label,
    program: flags.program,
    dataDir: flags.dataDir,
  }));
}

function printMcpCommand() {
  console.log(`node --no-warnings ${join(dirname(new URL(import.meta.url).pathname), "klemm-mcp-server.js")}`);
}

async function installMcpFromCli(args) {
  const flags = parseFlags(args);
  const client = flags.client ?? "generic";
  const config = buildMcpClientConfig({ client, dataDir: flags.dataDir });
  const rendered = JSON.stringify(config, null, 2);
  if (flags.output) {
    await writeFile(flags.output, `${rendered}\n`, "utf8");
    console.log(`MCP config written: ${flags.output}`);
    console.log(`Client: ${client}`);
    return;
  }

  console.log(`Klemm MCP config for ${client}`);
  console.log(rendered);
}

async function printVersion() {
  let version = "0.1.0";
  try {
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    version = pkg.version ?? version;
  } catch {
    // Keep the embedded fallback for installed single-file usage.
  }
  console.log(`Klemm version: ${version}`);
}

function printCompletion(args) {
  const shell = args[0] ?? "zsh";
  if (shell !== "zsh") throw new Error("Usage: klemm completion zsh");
  console.log(`#compdef klemm
_klemm() {
  local -a commands
  commands=(
    'status:Show daemon and local store status'
    'install:Install Klemm daemon, Codex wrapper, profiles, and policies'
    'codex wrap:Run a wrapped Codex dogfood session'
    'queue inspect:Inspect a queued authority decision'
    'policy pack:List or apply built-in policy packs'
    'profiles template:Print a runtime profile template'
    'config export:Export local Klemm configuration'
    'config import:Import local Klemm configuration'
    'uninstall:Remove Klemm local artifacts'
  )
  _describe 'klemm command' commands
}
_klemm`);
}

function printProfileTemplate(args) {
  const flags = parseFlags(args);
  const agent = flags.agent ?? args[0] ?? "codex";
  console.log(JSON.stringify({ profiles: { [agent]: buildProfileTemplate(agent) } }, null, 2));
}

async function exportConfigFromCli(args) {
  const flags = parseFlags(args);
  const output = flags.output;
  if (!output) throw new Error("Usage: klemm config export --output <path>");
  const profilesPath = flags.profiles ?? join(KLEMM_DATA_DIR, "profiles", "default-profiles.json");
  let profiles = null;
  try {
    profiles = JSON.parse(await readFile(profilesPath, "utf8"));
  } catch {
    profiles = null;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    version: "config-v1",
    state: store.getState(),
    profiles,
  };
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Config exported: ${output}`);
}

async function importConfigFromCli(args) {
  const flags = parseFlags(args);
  const input = flags.input;
  if (!input) throw new Error("Usage: klemm config import --input <path>");
  const payload = JSON.parse(await readFile(input, "utf8"));
  store.saveState(payload.state ?? payload);
  if (payload.profiles) {
    const profilesPath = flags.profiles ?? join(KLEMM_DATA_DIR, "profiles", "default-profiles.json");
    await mkdir(dirname(profilesPath), { recursive: true });
    await writeFile(profilesPath, `${JSON.stringify(payload.profiles, null, 2)}\n`, "utf8");
  }
  console.log(`Config imported: ${input}`);
}

async function uninstallFromCli(args) {
  const flags = parseFlags(args);
  const dataDir = flags.dataDir ?? KLEMM_DATA_DIR;
  const targets = [
    join(dataDir, "com.klemm.daemon.plist"),
    join(dataDir, "codex-integration"),
    join(dataDir, "profiles"),
    join(dataDir, "klemm.pid"),
  ];
  if (flags.dryRun) {
    console.log("Klemm uninstall dry run");
    for (const target of targets) console.log(`Would remove: ${target}`);
    return;
  }
  for (const target of targets) {
    await rm(target, { recursive: true, force: true });
  }
  console.log("Klemm uninstalled");
}

function buildMcpClientConfig({ client, dataDir } = {}) {
  const serverPath = join(dirname(new URL(import.meta.url).pathname), "klemm-mcp-server.js");
  const base = {
    command: process.execPath,
    args: ["--no-warnings", serverPath],
    env: {
      KLEMM_DATA_DIR: dataDir ?? process.env.KLEMM_DATA_DIR ?? join(process.cwd(), "data"),
    },
  };
  if (client === "codex") {
    return {
      mcpServers: {
        klemm: {
          ...base,
          description: "Klemm personal authority layer for Codex and subagents.",
        },
      },
    };
  }
  if (client === "claude-desktop") {
    return {
      mcpServers: {
        klemm: base,
      },
    };
  }
  return {
    mcpServers: {
      klemm: base,
    },
  };
}

function printDecision(decision) {
  console.log(`Decision: ${decision.decision}`);
  console.log(`Risk: ${decision.riskLevel}`);
  console.log(`Decision ID: ${decision.id}`);
  console.log(`Reason: ${decision.reason}`);
  if (decision.rewrite) console.log(`Rewrite: ${decision.rewrite}`);
}

async function readPidFile(pidFile) {
  try {
    const pid = Number((await readFile(pidFile, "utf8")).trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeDaemonHealth(url = process.env.KLEMM_DAEMON_URL) {
  const target = url ?? `http://127.0.0.1:${process.env.KLEMM_PORT ?? 8765}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 250);
    const response = await fetch(`${String(target).replace(/\/$/, "")}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return { ok: response.ok, url: target };
  } catch (error) {
    return { ok: false, url: target, error: error.message };
  }
}

async function callDaemonApi(path, { method = "GET", body } = {}) {
  const baseUrl = process.env.KLEMM_DAEMON_URL;
  if (!baseUrl) return { attempted: false, ok: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300);
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return { attempted: true, ok: false, status: response.status };
    return { attempted: true, ok: true, payload: await response.json() };
  } catch (error) {
    clearTimeout(timeout);
    return { attempted: true, ok: false, error };
  }
}

function buildCodexSkillTemplate() {
  return [
    "---",
    "name: klemm",
    "description: Use when Codex should operate under Klemm's local authority layer.",
    "---",
    "",
    "# Klemm",
    "",
    "Start real sessions with `klemm codex wrap` or the installed `klemm-codex` wrapper. The wrapper starts the hub mission, injects `KLEMM_MISSION_ID`, `KLEMM_AGENT_ID`, `KLEMM_CODEX_CONTEXT_COMMAND`, `KLEMM_CODEX_RUN_COMMAND`, and `KLEMM_CODEX_DEBRIEF_COMMAND`, routes allowed work through capture-mode supervision, queues risky launches before execution, and reports the final debrief. Inside an active session, fetch `klemm codex context`, run commands through `klemm codex run`, ask authority before risky actions, and debrief with `klemm codex debrief`.",
    "",
  ].join("\n");
}

function printMemoryCandidate(memory) {
  const evidence = memory.evidence
    ? ` evidence=${[memory.evidence.conversationId, memory.evidence.sessionId, memory.evidence.url, memory.evidence.commit].filter(Boolean).join("|") || memory.evidence.messageId || "attached"}`
    : "";
  console.log(`- ${memory.id} [${memory.memoryClass}] confidence=${memory.confidence} source=${memory.source} ref=${memory.sourceRef}${evidence}: ${memory.text}`);
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
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

function normalizeListFlag(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
  klemm install [--data-dir path] [--policy-pack coding-afk] [--agents codex,claude,shell] [--check-health]
  klemm setup [--data-dir path] [--codex-dir path] [--codex-history path] [--never "..."] [--dry-run-launchctl]
  klemm status
  klemm version
  klemm codex hub --goal "..." [--id mission-codex]
  klemm codex event --mission mission-id --type command_planned --summary "..." --action-id decision-id --action-type command --target "npm test"
  klemm codex context --mission mission-id
  klemm codex debrief --mission mission-id
  klemm codex dogfood --id mission-id --goal "..." --plan "..."
  klemm codex report --mission mission-id --type tool_call --tool shell --command "npm test"
  klemm codex run --mission mission-id -- <command> [args...]
  klemm codex wrap --id mission-id --goal "..." [--session-id id] [--adapter-client id] [--adapter-token token] [--dry-run] [--finish] -- <command> [args...]
  klemm codex install --output-dir path [--data-dir path]
  klemm mission start --hub codex --goal "..." [--allow a,b] [--block x,y] [--rewrite]
  klemm mission current
  klemm mission list
  klemm mission finish <mission-id> [note]
  klemm agent register --id agent-codex --mission mission-id --name Codex --kind coding_agent
  klemm event record --mission mission-id --agent agent-codex --type command_planned --summary "..."
  klemm agents
  klemm propose --mission mission-id --actor Codex --type git_push --target "origin main"
  klemm queue
  klemm queue inspect <decision-id>
  klemm queue approve|deny <decision-id> [note]
  klemm queue rewrite <decision-id> --to "replacement command"
  klemm approve|deny|rewrite <decision-id> [note]
  klemm dogfood status --mission mission-id
  klemm dogfood debrief --mission mission-id
  klemm memory ingest --source chatgpt_export --file export.txt
  klemm memory ingest-export --source chatgpt_export --file export.json
  klemm memory import-source --source chatgpt --file export.json
  klemm context import --provider chatgpt|claude|codex|chrome_history|git_history --file export.json
  klemm memory search --query "deploy review"
  klemm memory approve|reject|pin <memory-id> [note]
  klemm memory review [--group-by-source]
  klemm memory promote-policy <memory-id> [--action-types git_push] [--target-includes github]
  klemm user model [--pending]
  klemm sync add --id source-id --provider codex --path export.jsonl [--interval-minutes 30]
  klemm sync plan [--id source-id]
  klemm sync run [--id source-id] [--due]
  klemm sync status
  klemm onboard --stdin
  klemm onboard v2 --stdin
  klemm debrief [--mission mission-id]
  klemm tui [--mission mission-id] [--view overview|memory|queue|agents|policies|model|logs|trust] [--decision decision-id] [--interactive]
  klemm run codex|claude|shell|profile-name [--profile-file path] [--mission mission-id] [--dry-run] [--capture] [--record-tree] [--timeout-ms 60000] -- [args...]
  klemm supervise [--mission mission-id] [--capture] [--record-tree] [--timeout-ms 60000] [--watch] [--watch-loop] [--intercept-output] [--watch-interval-ms 1000] [--cwd path] -- <command> [args...]
  klemm supervised-runs [--details]
  klemm monitor status [--mission mission-id]
  klemm monitor evaluate [--mission mission-id] [--agent agent-id]
  klemm policy add --id policy-id --name "..." --action-types deployment --target-includes prod
  klemm policy pack list|apply <coding-afk|finance-accounting|email-calendar|browser-research|strict-no-external>
  klemm policy simulate --mission mission-id --type deployment --target "deploy prod" --external deployment
  klemm adapter token add --id codex-local --token token --versions 1,2
  klemm helper launch-agent [--program /usr/local/bin/klemm] [--data-dir path]
  klemm mcp stdio
  klemm install mcp --client codex|claude-desktop|generic [--output path]
  klemm completion zsh
  klemm profiles template [--agent codex]
  klemm config export --output path
  klemm config import --input path
  klemm uninstall [--data-dir path] [--dry-run]
  klemm os snapshot [--mission mission-id] [--process-file fixture.txt]
  klemm os status [--mission mission-id]
  klemm os permissions
  klemm doctor [--pid-file path] [--log-file path] [--repair]
  klemm daemon install|migrate|start|stop|restart|logs|doctor|bootstrap|bootout|kickstart
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
