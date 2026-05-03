const SUPPORTED_EVENTS = new Set(["plan", "tool_call", "diff", "uncertainty", "debrief", "activity"]);

export function createKlemmAdapterClient(options = {}) {
  const base = {
    adapterClientId: options.adapterClientId ?? options.clientId,
    adapterToken: options.adapterToken ?? options.token,
    protocolVersion: Number(options.protocolVersion ?? 1),
    missionId: options.missionId,
    agentId: options.agentId ?? "agent",
  };

  const envelope = (event, payload = {}) => buildAdapterEnvelope({ ...base, event, ...payload });

  return {
    envelope,
    plan(payload = {}) {
      return envelope("plan", payload);
    },
    toolCall(payload = {}) {
      return envelope("tool_call", {
        ...payload,
        toolCall: payload.toolCall ?? {
          name: payload.tool ?? payload.name,
          arguments: {
            ...(payload.arguments ?? {}),
            ...(payload.command ? { command: payload.command } : {}),
          },
        },
      });
    },
    diff(payload = {}) {
      return envelope("diff", {
        ...payload,
        diff: payload.diff ?? { files: payload.files ?? payload.fileChanges ?? [] },
      });
    },
    uncertainty(payload = {}) {
      return envelope("uncertainty", payload);
    },
    debrief(payload = {}) {
      return envelope("debrief", payload);
    },
    conformanceSamples() {
      return [
        envelope("plan", { summary: "Plan the delegated work.", plan: "Inspect, implement, verify." }),
        envelope("tool_call", { summary: "Run tests.", tool: "shell", command: "npm test" }),
        envelope("diff", { summary: "Report changed files.", files: ["src/example.js"] }),
        envelope("uncertainty", { summary: "Escalate unclear intent.", uncertainty: "Needs user review." }),
        envelope("debrief", { summary: "Summarize outcome.", debrief: "Work completed and verified." }),
      ];
    },
  };
}

export function buildAdapterEnvelope(options = {}) {
  const event = normalizeEvent(options.event);
  return {
    protocolVersion: Number(options.protocolVersion ?? 1),
    adapterClientId: options.adapterClientId,
    adapterToken: options.adapterToken,
    missionId: options.missionId,
    agentId: options.agentId ?? "agent",
    event,
    summary: options.summary ?? `${event} reported by ${options.agentId ?? "agent"}`,
    plan: options.plan,
    tool: options.tool,
    command: options.command,
    toolCall: options.toolCall,
    diff: options.diff,
    fileChanges: options.fileChanges,
    uncertainty: options.uncertainty,
    debrief: options.debrief,
    target: options.target,
    metadata: options.metadata ?? {},
  };
}

export function validateAdapterEnvelope(envelope = {}) {
  const errors = [];
  if (!Number.isFinite(Number(envelope.protocolVersion)) || Number(envelope.protocolVersion) < 1) {
    errors.push("protocolVersion must be a positive number");
  }
  if (!envelope.missionId) errors.push("missionId is required");
  if (!envelope.agentId) errors.push("agentId is required");
  if (!SUPPORTED_EVENTS.has(envelope.event)) errors.push(`event must be one of ${Array.from(SUPPORTED_EVENTS).join(",")}`);
  if (envelope.event === "tool_call" && !envelope.toolCall?.name && !envelope.tool) {
    errors.push("tool_call requires toolCall.name or tool");
  }
  if (envelope.event === "diff" && !Array.isArray(envelope.diff?.files ?? envelope.fileChanges)) {
    errors.push("diff requires diff.files or fileChanges");
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

function normalizeEvent(event) {
  const normalized = String(event ?? "activity").toLowerCase();
  return SUPPORTED_EVENTS.has(normalized) ? normalized : "activity";
}
