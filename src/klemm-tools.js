import {
  distillMemory,
  buildCodexContext,
  getKlemmStatus,
  ingestMemoryExport,
  proposeAction,
  recordAgentEvent,
  recordOsObservation,
  recordQueuedDecision,
  recordSupervisedRun,
  renderKlemmDashboard,
  reviewMemory,
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

  throw new Error(`Unknown Klemm tool: ${name}`);
}
