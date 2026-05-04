import {
  addReviewedProxyMemory,
  askProxy,
  buildUserModelSummary,
  addAdapterClient,
  continueProxy,
  distillMemory,
  buildCodexContext,
  addStructuredPolicy,
  attachGoalAgent,
  completeGoal,
  evaluateAgentAlignment,
  findGoal,
  getGoalStatus,
  getKlemmStatus,
  getProxyStatus,
  importContextSource,
  importMemorySource,
  ingestMemoryExport,
  simulatePolicyDecision,
  normalizeAgentAdapterEnvelope,
  proposeAction,
  recordAgentActivity,
  recordAgentEvent,
  recordGoalTick,
  recordOsObservation,
  recordQueuedDecision,
  recordSupervisedRun,
  reviewProxy,
  renderKlemmDashboard,
  reviewMemory,
  promoteMemoryToPolicy,
  searchMemories,
  registerAgent,
  startGoal,
  startCodexHub,
  startMission,
  summarizeGoalDebrief,
  summarizeDebrief,
} from "./klemm.js";
import { buildOsObservation } from "./klemm-os.js";

export const KLEMM_MCP_TOOLS = [
  {
    name: "register_agent",
    description: "Register an agent under a Klemm mission so its actions can be supervised.",
  },
  {
    name: "start_mission",
    description: "Start a time-boxed mission lease that defines user intent and delegated authority.",
  },
  {
    name: "propose_action",
    description: "Normalize and classify a proposed agent action before execution.",
  },
  {
    name: "request_authority",
    description: "Ask Klemm whether an agent may proceed, pause, queue, or rewrite an action.",
  },
  {
    name: "record_outcome",
    description: "Record the user's resolution for a queued Klemm decision.",
  },
  {
    name: "get_user_model_summary",
    description: "Return a redacted summary of reviewed and pending Klemm memories.",
  },
  {
    name: "queue_user_decision",
    description: "Queue an explicit question or high-risk decision for the user.",
  },
  {
    name: "record_agent_event",
    description: "Record an agent lifecycle/tool/file/external-action event and classify its action when present.",
  },
  {
    name: "start_codex_hub",
    description: "Start a Codex hub mission with Klemm's default AFK coding authority boundaries.",
  },
  {
    name: "ingest_memory_export",
    description: "Import AI chat history and distill it into local memory candidates.",
  },
  {
    name: "render_dashboard",
    description: "Render Klemm's terminal dashboard summary for a mission.",
  },
  {
    name: "review_memory",
    description: "Approve, reject, or pin a local Klemm memory candidate.",
  },
  {
    name: "record_supervised_run",
    description: "Persist transcript, exit code, duration, and file changes for a supervised process.",
  },
  {
    name: "codex_context",
    description: "Return the context packet Codex should use while acting as a Klemm hub.",
  },
  {
    name: "record_os_observation",
    description: "Persist an OS observation snapshot, including unmanaged agent-like process alerts.",
  },
  {
    name: "get_os_status",
    description: "Return recent OS observations for a mission.",
  },
  {
    name: "record_agent_activity",
    description: "Record observed agent work into Klemm's continuous activity stream.",
  },
  {
    name: "evaluate_agent_alignment",
    description: "Evaluate recent agent activity against the current mission and user authority model.",
  },
  {
    name: "get_agent_monitor",
    description: "Return recent agent activities, alignment reports, and active interventions for a mission.",
  },
  {
    name: "record_adapter_envelope",
    description: "Normalize an agent adapter protocol envelope and record its activity/action with Klemm.",
  },
  {
    name: "add_structured_policy",
    description: "Add a structured, auditable policy rule to Klemm's authority engine.",
  },
  {
    name: "simulate_policy_decision",
    description: "Run Policy Engine v2 against a proposed action without persisting a decision.",
  },
  {
    name: "add_adapter_client",
    description: "Register a local adapter client token and supported protocol versions.",
  },
  {
    name: "import_memory_source",
    description: "Import a provider-specific memory source and distill local memory candidates.",
  },
  {
    name: "import_context_source",
    description: "Import ChatGPT, Claude, Codex, browser history, or git history with evidence and quarantine.",
  },
  {
    name: "promote_memory_policy",
    description: "Promote a reviewed memory into a structured authority policy.",
  },
  {
    name: "search_memories",
    description: "Search distilled Klemm memories by query terms.",
  },
  {
    name: "goal_start",
    description: "Start a durable Klemm Goal for cross-agent /goal-style supervision.",
  },
  {
    name: "goal_attach",
    description: "Attach an agent to a durable Klemm Goal and its backing mission lease.",
  },
  {
    name: "goal_tick",
    description: "Record goal progress, evidence, changed files, and alignment/risk hints.",
  },
  {
    name: "goal_status",
    description: "Inspect a Klemm Goal, attached agents, activities, decisions, and observation events.",
  },
  {
    name: "goal_complete",
    description: "Mark a Klemm Goal complete with evidence.",
  },
  {
    name: "goal_debrief",
    description: "Render a goal-scoped debrief with evidence and risk hints.",
  },
  {
    name: "proxy_ask",
    description: "Ask Klemm to answer an agent clarification question as the user's proxy when safe.",
  },
  {
    name: "proxy_continue",
    description: "Ask Klemm for the next user-like continuation prompt for an aligned goal.",
  },
  {
    name: "proxy_status",
    description: "Inspect proxy questions, answers, continuations, and queued escalations.",
  },
  {
    name: "proxy_review",
    description: "Record review feedback for a Klemm proxy answer.",
  },
];

export function executeKlemmTool(name, args = {}, { state } = {}) {
  if (!state) throw new Error("Klemm state is required");

  if (name === "start_mission") {
    const nextState = startMission(state, args);
    return { state: nextState, result: { mission: nextState.missions[0] } };
  }

  if (name === "start_codex_hub") {
    const nextState = startCodexHub(state, args);
    return { state: nextState, result: { mission: nextState.missions[0], agent: nextState.agents[0] } };
  }

  if (name === "register_agent") {
    const nextState = registerAgent(state, args);
    return { state: nextState, result: { agent: nextState.agents[0] } };
  }

  if (name === "propose_action" || name === "request_authority") {
    const nextState = proposeAction(state, args);
    return {
      state: nextState,
      result: {
        decision: nextState.decisions[0],
        queueLength: nextState.queue.filter((item) => item.status === "queued").length,
      },
    };
  }

  if (name === "record_outcome") {
    const nextState = recordQueuedDecision(state, args);
    return {
      state: nextState,
      result: {
        queueItem: nextState.queue.find((item) => item.id === args.decisionId),
      },
    };
  }

  if (name === "record_agent_event") {
    const nextState = recordAgentEvent(state, args);
    return {
      state: nextState,
      result: {
        event: nextState.agentEvents[0],
        decision: args.action?.id ? nextState.decisions.find((decision) => decision.id === args.action.id) : null,
      },
    };
  }

  if (name === "record_agent_activity") {
    const nextState = recordAgentActivity(state, args);
    return { state: nextState, result: { activity: nextState.agentActivities[0] } };
  }

  if (name === "record_adapter_envelope") {
    const validation = validateAdapterClient(state, args);
    if (!validation.accepted) {
      return {
        state,
        result: {
          accepted: false,
          error: validation.error,
          protocol: validation.protocol,
        },
      };
    }
    const goal = args.goalId ? findGoal(state, args.goalId) : null;
    const envelope = normalizeAgentAdapterEnvelope({
      ...args,
      missionId: args.missionId ?? goal?.missionId,
      validation,
      protocolVersion: validation.protocol.negotiatedVersion,
    });
    let nextState = goal
      ? attachGoalAgent(state, {
          id: goal.id,
          agentId: envelope.agentId,
          kind: args.kind ?? "adapter_agent",
          command: envelope.command,
          source: args.adapterClientId ?? "adapter_envelope",
          now: args.now,
        })
      : state;
    nextState = recordAgentActivity(nextState, envelope.activity);
    let decision = null;
    if (envelope.action) {
      nextState = proposeAction(nextState, envelope.action);
      decision = nextState.decisions[0];
    }
    let goalTick = null;
    if (goal) {
      nextState = recordGoalTick(nextState, {
        id: goal.id,
        agentId: envelope.agentId,
        summary: envelope.summary,
        changedFiles: envelope.activity.fileChanges,
        evidence: args.evidence ?? envelope.activity.evidence?.plan,
        agentOutput: args.agentOutput ?? args.output,
        recordActivity: false,
        now: args.now,
      });
      goalTick = nextState.goals.find((item) => item.id === goal.id)?.ticks?.[0] ?? null;
    }
    return { state: nextState, result: { accepted: true, protocol: validation.protocol, envelope, activity: nextState.agentActivities[0], decision, goalTick } };
  }

  if (name === "evaluate_agent_alignment") {
    const nextState = evaluateAgentAlignment(state, args);
    const alignmentReport = nextState.alignmentReports[0];
    return {
      state: nextState,
      result: {
        alignmentReport,
        intervention: nextState.agentInterventions.find((intervention) => intervention.alignmentReportId === alignmentReport.id) ?? null,
      },
    };
  }

  if (name === "review_memory") {
    const nextState = reviewMemory(state, args);
    return { state: nextState, result: { memory: nextState.memories.find((memory) => memory.id === args.memoryId) } };
  }

  if (name === "record_supervised_run") {
    const nextState = recordSupervisedRun(state, args);
    return { state: nextState, result: { supervisedRun: nextState.supervisedRuns[0] } };
  }

  if (name === "record_os_observation") {
    const missionId = args.missionId;
    const supervisedCommands =
      args.supervisedCommands ??
      state.agents.filter((agent) => !missionId || agent.missionId === missionId).map((agent) => agent.command);
    const observation = buildOsObservation({
      ...args,
      supervisedCommands,
    });
    const nextState = recordOsObservation(state, observation);
    return { state: nextState, result: { osObservation: nextState.osObservations[0] } };
  }

  if (name === "get_user_model_summary") {
    const summary = buildUserModelSummary(state, {
      includePending: args.includePending ?? true,
      now: args.now,
    });
    return {
      state,
      result: {
        summary,
        status: getKlemmStatus(state),
        memories: state.memories.slice(0, args.limit ?? 10).map((memory) => ({
          id: memory.id,
          memoryClass: memory.memoryClass,
          text: memory.text,
          confidence: memory.confidence,
          status: memory.status,
          source: memory.source,
        })),
        rejectedMemoryInputCount: state.rejectedMemoryInputs.length,
      },
    };
  }

  if (name === "queue_user_decision") {
    const nextState = proposeAction(state, {
      ...args,
      actionType: args.actionType ?? "user_decision",
      missionRelevance: args.missionRelevance ?? "related",
      externality: args.externality ?? "user_review_required",
    });
    return { state: nextState, result: { decision: nextState.decisions[0] } };
  }

  if (name === "distill_memory") {
    const nextState = distillMemory(state, args);
    return { state: nextState, result: { memories: nextState.memories, rejected: nextState.rejectedMemoryInputs } };
  }

  if (name === "add_structured_policy") {
    const nextState = addStructuredPolicy(state, args);
    return { state: nextState, result: { policy: nextState.policies[0] } };
  }

  if (name === "simulate_policy_decision") {
    return { state, result: simulatePolicyDecision(state, args) };
  }

  if (name === "add_adapter_client") {
    const nextState = addAdapterClient(state, args);
    return { state: nextState, result: { adapterClient: nextState.adapterClients[0] } };
  }

  if (name === "import_memory_source") {
    const nextState = importMemorySource(state, args);
    return { state: nextState, result: { memorySource: nextState.memorySources[0], memories: nextState.memories } };
  }

  if (name === "import_context_source") {
    const nextState = importContextSource(state, args);
    return {
      state: nextState,
      result: {
        memorySource: nextState.memorySources[0],
        memories: nextState.memories,
        quarantine: nextState.memoryQuarantine ?? [],
      },
    };
  }

  if (name === "promote_memory_policy") {
    const nextState = promoteMemoryToPolicy(state, args);
    return { state: nextState, result: { policy: nextState.policies[0] } };
  }

  if (name === "search_memories") {
    return { state, result: { memories: searchMemories(state, args) } };
  }

  if (name === "goal_start") {
    const nextState = startGoal(state, args);
    const goal = nextState.goals[0];
    return { state: nextState, result: { goal, mission: nextState.missions.find((mission) => mission.id === goal.missionId) } };
  }

  if (name === "goal_attach") {
    const nextState = attachGoalAgent(state, args);
    const goal = findGoal(nextState, args.id ?? args.goalId ?? args.goal ?? args.missionId);
    return { state: nextState, result: { goal, agent: nextState.agents.find((agent) => agent.id === (args.agentId ?? args.agent ?? args.actor)) } };
  }

  if (name === "goal_tick") {
    const nextState = recordGoalTick(state, args);
    const goal = findGoal(nextState, args.id ?? args.goalId ?? args.goal ?? args.missionId);
    return { state: nextState, result: { goal, tick: goal?.ticks?.[0] } };
  }

  if (name === "goal_status") {
    return { state, result: getGoalStatus(state, args) };
  }

  if (name === "goal_complete") {
    const nextState = completeGoal(state, args);
    const goal = findGoal(nextState, args.id ?? args.goalId ?? args.goal ?? args.missionId);
    return { state: nextState, result: { goal } };
  }

  if (name === "goal_debrief") {
    return { state, result: { debrief: summarizeGoalDebrief(state, args) } };
  }

  if (name === "proxy_ask") {
    const nextState = askProxy(state, args);
    return { state: nextState, result: { question: nextState.proxyQuestions[0], answer: nextState.proxyAnswers[0] } };
  }

  if (name === "proxy_continue") {
    const nextState = continueProxy(state, args);
    return { state: nextState, result: { continuation: nextState.proxyContinuations[0] } };
  }

  if (name === "proxy_status") {
    return { state, result: getProxyStatus(state, args) };
  }

  if (name === "proxy_review") {
    const nextState = reviewProxy(state, args);
    return { state: nextState, result: { review: nextState.proxyReviews[0] } };
  }

  if (name === "proxy_memory_seed") {
    const nextState = addReviewedProxyMemory(state, args);
    return { state: nextState, result: { memory: nextState.memories[0] } };
  }

  if (name === "ingest_memory_export") {
    const nextState = ingestMemoryExport(state, args);
    return { state: nextState, result: { import: nextState.imports[0], memories: nextState.memories } };
  }

  if (name === "debrief") {
    return { state, result: { debrief: summarizeDebrief(state, { missionId: args.missionId }) } };
  }

  if (name === "render_dashboard") {
    return { state, result: { dashboard: renderKlemmDashboard(state, { missionId: args.missionId }) } };
  }

  if (name === "codex_context") {
    return { state, result: buildCodexContext(state, { missionId: args.missionId }) };
  }

  if (name === "get_os_status") {
    return {
      state,
      result: {
        osObservations: (state.osObservations ?? []).filter((observation) => !args.missionId || observation.missionId === args.missionId),
      },
    };
  }

  if (name === "get_agent_monitor") {
    return {
      state,
      result: buildAgentMonitorResult(state, args),
    };
  }

  throw new Error(`Unknown Klemm tool: ${name}`);
}

function buildAgentMonitorResult(state, args = {}) {
  const missionId = args.missionId;
  const agentId = args.agentId;
  return {
    activities: (state.agentActivities ?? [])
      .filter((activity) => !missionId || activity.missionId === missionId)
      .filter((activity) => !agentId || activity.agentId === agentId)
      .slice(0, args.limit ?? 20),
    alignmentReports: (state.alignmentReports ?? [])
      .filter((report) => !missionId || report.missionId === missionId)
      .filter((report) => !agentId || report.agentId === agentId)
      .slice(0, args.limit ?? 20),
    interventions: (state.agentInterventions ?? [])
      .filter((intervention) => !missionId || intervention.missionId === missionId)
      .filter((intervention) => !agentId || intervention.agentId === agentId)
      .slice(0, args.limit ?? 20),
  };
}

function validateAdapterClient(state, args = {}) {
  const requestedVersion = Number(args.protocolVersion ?? 1);
  if (!args.adapterClientId && !args.adapterToken) {
    return {
      accepted: true,
      protocol: {
        requestedVersion,
        negotiatedVersion: requestedVersion,
        supportedVersions: [requestedVersion],
      },
    };
  }
  const client = (state.adapterClients ?? []).find((item) => item.id === args.adapterClientId && item.status === "active");
  if (!client) {
    return {
      accepted: false,
      error: `Unknown adapter client: ${args.adapterClientId ?? "missing"}`,
      protocol: { requestedVersion, negotiatedVersion: null, supportedVersions: [] },
    };
  }
  if (client.token && args.adapterToken !== client.token) {
    return {
      accepted: false,
      error: "Adapter token rejected.",
      protocol: { requestedVersion, negotiatedVersion: null, supportedVersions: client.protocolVersions ?? [1] },
    };
  }
  const supported = client.protocolVersions ?? [1];
  if (!supported.includes(requestedVersion)) {
    return {
      accepted: false,
      error: `Unsupported adapter protocol version: ${requestedVersion}`,
      protocol: { requestedVersion, negotiatedVersion: null, supportedVersions: supported },
    };
  }
  return {
    accepted: true,
    protocol: {
      requestedVersion,
      negotiatedVersion: requestedVersion,
      supportedVersions: supported,
      adapterClientId: client.id,
    },
  };
}
