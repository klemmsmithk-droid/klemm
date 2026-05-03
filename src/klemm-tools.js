import {
  distillMemory,
  buildCodexContext,
  addStructuredPolicy,
  evaluateAgentAlignment,
  getKlemmStatus,
  importMemorySource,
  ingestMemoryExport,
  normalizeAgentAdapterEnvelope,
  proposeAction,
  recordAgentActivity,
  recordAgentEvent,
  recordOsObservation,
  recordQueuedDecision,
  recordSupervisedRun,
  renderKlemmDashboard,
  reviewMemory,
  searchMemories,
  registerAgent,
  startCodexHub,
  startMission,
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
    name: "import_memory_source",
    description: "Import a provider-specific memory source and distill local memory candidates.",
  },
  {
    name: "search_memories",
    description: "Search distilled Klemm memories by query terms.",
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
    const envelope = normalizeAgentAdapterEnvelope(args);
    let nextState = recordAgentActivity(state, envelope.activity);
    let decision = null;
    if (envelope.action) {
      nextState = proposeAction(nextState, envelope.action);
      decision = nextState.decisions[0];
    }
    return { state: nextState, result: { envelope, activity: nextState.agentActivities[0], decision } };
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
    return {
      state,
      result: {
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

  if (name === "import_memory_source") {
    const nextState = importMemorySource(state, args);
    return { state: nextState, result: { memorySource: nextState.memorySources[0], memories: nextState.memories } };
  }

  if (name === "search_memories") {
    return { state, result: { memories: searchMemories(state, args) } };
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
