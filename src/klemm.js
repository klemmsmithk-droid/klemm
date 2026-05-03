const DEFAULT_ALLOWED_ACTIONS = ["read_files", "edit_local_code", "run_tests", "local_analysis"];
const DEFAULT_BLOCKED_ACTIONS = [
  "external_send",
  "credential_change",
  "oauth_scope_change",
  "git_push",
  "delete_data",
  "financial_action",
  "legal_action",
  "reputation_action",
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior) instructions/i,
  /disregard (all )?(previous|prior) instructions/i,
  /system prompt/i,
  /developer message/i,
  /mark .* as allowed/i,
];

export function createInitialKlemmState({ now = new Date().toISOString() } = {}) {
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    missions: [],
    agents: [],
    agentEvents: [],
    decisions: [],
    queue: [],
    memories: [],
    imports: [],
    supervisedRuns: [],
    osObservations: [],
    rejectedMemoryInputs: [],
    auditEvents: [
      {
        id: "audit-001",
        type: "klemm_initialized",
        at: now,
        summary: "Klemm local authority store initialized.",
      },
    ],
  };
}

export function startCodexHub(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const missionState = startMission(state, {
    id: options.id,
    hub: "codex",
    goal: options.goal ?? "Supervise Codex as the temporary hub while the user is away.",
    allowedActions: options.allowedActions ?? ["read_files", "edit_local_code", "run_tests", "write_local_docs", "register_subagents"],
    blockedActions:
      options.blockedActions ?? [
        "external_send",
        "credential_change",
        "oauth_scope_change",
        "git_push",
        "delete_data",
        "financial_action",
        "legal_action",
        "reputation_action",
        "deployment",
      ],
    rewriteAllowed: options.rewriteAllowed ?? true,
    durationMinutes: options.durationMinutes ?? 120,
    escalationChannel: options.escalationChannel ?? "codex_thread",
    now,
  });

  return registerAgent(missionState, {
    id: options.agentId ?? "agent-codex",
    missionId: missionState.missions[0].id,
    name: "Codex",
    kind: "codex_hub",
    command: "codex",
    now,
  });
}

export function startMission(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `mission-${compactTimestamp(now)}`;
  const durationMinutes = Number(options.durationMinutes ?? 120);
  const mission = {
    id,
    hub: options.hub ?? "terminal",
    goal: options.goal ?? "Supervise delegated agent work while the user is away.",
    allowedActions: normalizeList(options.allowedActions, DEFAULT_ALLOWED_ACTIONS),
    blockedActions: normalizeList(options.blockedActions, DEFAULT_BLOCKED_ACTIONS),
    rewriteAllowed: options.rewriteAllowed ?? true,
    expiresAt: options.expiresAt ?? new Date(Date.parse(now) + durationMinutes * 60_000).toISOString(),
    supervisedAgents: [],
    escalationChannel: options.escalationChannel ?? "terminal_queue",
    status: "active",
    createdAt: now,
  };

  return updateState(
    {
      ...state,
      missions: [mission, ...withoutId(state.missions, id)],
    },
    now,
    {
      type: "mission_started",
      at: now,
      missionId: mission.id,
      summary: `${mission.hub} mission started: ${mission.goal}`,
    },
  );
}

export function registerAgent(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `agent-${compactTimestamp(now)}`;
  const missionId = options.missionId ?? activeMission(state)?.id;
  const agent = {
    id,
    missionId,
    name: options.name ?? id,
    kind: options.kind ?? "agent",
    command: options.command ?? "",
    status: "active",
    registeredAt: now,
    lastSeenAt: now,
  };
  const missions = state.missions.map((mission) =>
    mission.id === missionId
      ? {
          ...mission,
          supervisedAgents: Array.from(new Set([...(mission.supervisedAgents ?? []), id])),
        }
      : mission,
  );

  return updateState(
    {
      ...state,
      missions,
      agents: [agent, ...withoutId(state.agents, id)],
    },
    now,
    {
      type: "agent_registered",
      at: now,
      missionId,
      agentId: id,
      summary: `${agent.name} registered under mission ${missionId ?? "none"}.`,
    },
  );
}

export function proposeAction(state, proposal = {}) {
  const now = proposal.now ?? new Date().toISOString();
  const mission = findMission(state, proposal.missionId);
  const normalized = normalizeActionProposal(proposal, mission, now);
  const matchedPolicies = findPolicyMatches(state, normalized);
  const authority = classifyAuthority(normalized, mission, matchedPolicies);
  const decision = {
    id: normalized.id,
    missionId: normalized.missionId,
    actor: normalized.actor,
    actionType: normalized.actionType,
    target: normalized.target,
    decision: authority.decision,
    riskLevel: authority.riskLevel,
    reason: authority.reason,
    rewrite: authority.rewrite,
    matchedPolicies,
    status: authority.decision === "queue" ? "queued" : "resolved",
    createdAt: now,
    proposal: normalized,
  };
  const queued =
    decision.decision === "queue"
      ? [
          {
            id: decision.id,
            missionId: decision.missionId,
            actor: decision.actor,
            actionType: decision.actionType,
            target: decision.target,
            reason: decision.reason,
            riskLevel: decision.riskLevel,
            status: "queued",
            createdAt: now,
          },
          ...state.queue.filter((item) => item.id !== decision.id),
        ]
      : state.queue;

  return updateState(
    {
      ...state,
      decisions: [decision, ...withoutId(state.decisions, decision.id)],
      queue: queued,
    },
    now,
    {
      type: "authority_decision",
      at: now,
      missionId: decision.missionId,
      decisionId: decision.id,
      summary: `${decision.decision} ${decision.actor} ${decision.actionType}: ${decision.target}`,
    },
  );
}

export function recordQueuedDecision(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const decisionId = options.decisionId;
  const outcome = normalizeOutcome(options.outcome);
  if (!decisionId) throw new Error("decisionId is required");

  let found = false;
  const queue = state.queue.map((item) => {
    if (item.id !== decisionId) return item;
    found = true;
    return {
      ...item,
      status: outcome,
      resolvedAt: now,
      note: options.note ?? "",
    };
  });
  if (!found) throw new Error(`Queued decision not found: ${decisionId}`);

  const decisions = state.decisions.map((decision) =>
    decision.id === decisionId
      ? {
          ...decision,
          status: outcome,
          resolvedAt: now,
          userNote: options.note ?? "",
        }
      : decision,
  );

  return updateState(
    {
      ...state,
      queue,
      decisions,
    },
    now,
    {
      type: "queued_decision_recorded",
      at: now,
      decisionId,
      summary: `${decisionId} recorded as ${outcome}.`,
    },
  );
}

export function distillMemory(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const source = options.source ?? "manual";
  const sourceRef = options.sourceRef ?? source;
  const lines = String(options.text ?? "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const memories = [];
  const rejected = [];
  const seenMemoryTexts = new Set((state.memories ?? []).map((memory) => normalizeMemoryText(memory.text)));
  let duplicateCount = 0;

  for (const line of lines) {
    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(line))) {
      rejected.push({
        id: `rejected-memory-${compactTimestamp(now)}-${rejected.length + 1}`,
        source,
        sourceRef,
        text: line,
        reason: "Rejected likely prompt injection in imported user history.",
        rejectedAt: now,
      });
      continue;
    }

    const memoryClass = classifyMemoryLine(line);
    if (!memoryClass) continue;
    const normalizedText = normalizeMemoryText(line);
    if (seenMemoryTexts.has(normalizedText)) {
      duplicateCount += 1;
      continue;
    }
    seenMemoryTexts.add(normalizedText);

    memories.push({
      id: `memory-${compactTimestamp(now)}-${state.memories.length + memories.length + 1}`,
      memoryClass,
      text: line,
      source,
      sourceRef,
      confidence: inferMemoryConfidence(line, memoryClass),
      status: "pending_review",
      createdAt: now,
    });
  }

  return updateState(
    {
      ...state,
      memories: [...memories, ...state.memories],
      rejectedMemoryInputs: [...rejected, ...state.rejectedMemoryInputs],
      lastMemoryDistillation: {
        duplicateCount,
        distilledCount: memories.length,
        rejectedCount: rejected.length,
      },
    },
    now,
    {
      type: "memory_distilled",
      at: now,
      summary: `${memories.length} memory item(s) distilled from ${source}; ${rejected.length} rejected.`,
    },
  );
}

export function ingestMemoryExport(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const source = options.source ?? "ai_chat_export";
  const sourceRef = options.sourceRef ?? source;
  const messages = extractMemoryExportMessages(options.text ?? "");
  const text = messages.map((message) => message.content).join("\n");
  const next = distillMemory(state, {
    source,
    sourceRef,
    text,
    now,
  });
  const importRecord = {
    id: options.id ?? `import-${compactTimestamp(now)}-${(state.imports?.length ?? 0) + 1}`,
    source,
    sourceRef,
    messageCount: messages.length,
    distilledCount: next.memories.length - state.memories.length,
    rejectedCount: next.rejectedMemoryInputs.length - state.rejectedMemoryInputs.length,
    duplicateCount: next.lastMemoryDistillation?.duplicateCount ?? 0,
    importedAt: now,
  };

  return updateState(
    {
      ...next,
      imports: [importRecord, ...(next.imports ?? [])],
    },
    now,
    {
      type: "memory_export_ingested",
      at: now,
      importId: importRecord.id,
      summary: `${importRecord.messageCount} message(s) imported from ${source}.`,
    },
  );
}

export function reviewMemory(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const memoryId = options.memoryId;
  const status = normalizeMemoryReviewStatus(options.status);
  if (!memoryId) throw new Error("memoryId is required");

  let found = false;
  const memories = state.memories.map((memory) => {
    if (memory.id !== memoryId) return memory;
    found = true;
    return {
      ...memory,
      status,
      reviewedAt: now,
      reviewNote: options.note ?? "",
    };
  });
  if (!found) throw new Error(`Memory not found: ${memoryId}`);

  return updateState(
    {
      ...state,
      memories,
    },
    now,
    {
      type: "memory_reviewed",
      at: now,
      memoryId,
      summary: `${memoryId} reviewed as ${status}.`,
    },
  );
}

export function recordAgentEvent(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const mission = findMission(state, options.missionId);
  const event = {
    id: options.id ?? `event-${compactTimestamp(now)}-${(state.agentEvents?.length ?? 0) + 1}`,
    missionId: options.missionId ?? mission?.id,
    agentId: options.agentId ?? "unknown_agent",
    type: normalizeEventType(options.type),
    summary: options.summary ?? "Agent event recorded.",
    payload: options.payload ?? {},
    actionDecisionId: options.action?.id,
    createdAt: now,
  };
  const withEvent = updateState(
    {
      ...state,
      agentEvents: [event, ...(state.agentEvents ?? [])],
    },
    now,
    {
      type: "agent_event_recorded",
      at: now,
      missionId: event.missionId,
      agentId: event.agentId,
      eventId: event.id,
      summary: `${event.type}: ${event.summary}`,
    },
  );

  if (!options.action) return withEvent;

  return proposeAction(withEvent, {
    ...options.action,
    missionId: options.action.missionId ?? event.missionId,
    actor: options.action.actor ?? event.agentId,
    now,
  });
}

export function recordOsObservation(state, observation = {}) {
  const now = observation.observedAt ?? observation.now ?? new Date().toISOString();
  const normalized = {
    id: observation.id ?? `os-observation-${compactTimestamp(now)}`,
    missionId: observation.missionId ?? activeMission(state)?.id,
    observedAt: now,
    platform: observation.platform ?? process.platform,
    processCount: observation.processCount ?? observation.processes?.length ?? 0,
    processes: observation.processes ?? [],
    unmanagedAgents: observation.unmanagedAgents ?? [],
    permissions: observation.permissions ?? {},
    fileEvents: observation.fileEvents ?? [],
    appActivity: observation.appActivity ?? null,
    notes: observation.notes ?? "",
  };
  const withObservation = updateState(
    {
      ...state,
      osObservations: [normalized, ...(state.osObservations ?? [])],
    },
    now,
    {
      type: "os_observation_recorded",
      at: now,
      missionId: normalized.missionId,
      osObservationId: normalized.id,
      summary: `${normalized.processCount} process(es), ${normalized.unmanagedAgents.length} unmanaged agent-like process(es).`,
    },
  );

  if (normalized.unmanagedAgents.length === 0) return withObservation;

  return recordAgentEvent(withObservation, {
    id: `event-${normalized.id}`,
    missionId: normalized.missionId,
    agentId: "klemm-os-observer",
    type: "os_observation_alert",
    summary: `${normalized.unmanagedAgents.length} unmanaged agent-like process(es) detected.`,
    payload: {
      osObservationId: normalized.id,
      unmanagedAgents: normalized.unmanagedAgents,
    },
    now,
  });
}

export function recordSupervisedRun(state, options = {}) {
  const now = options.finishedAt ?? options.now ?? new Date().toISOString();
  const id = options.id ?? `supervised-${compactTimestamp(now)}-${(state.supervisedRuns?.length ?? 0) + 1}`;
  const run = {
    id,
    missionId: options.missionId,
    command: options.command ?? "",
    cwd: options.cwd ?? "",
    exitCode: options.exitCode ?? 0,
    durationMs: options.durationMs ?? 0,
    stdout: clipTranscript(options.stdout ?? ""),
    stderr: clipTranscript(options.stderr ?? ""),
    fileChanges: options.fileChanges ?? [],
    startedAt: options.startedAt ?? now,
    finishedAt: now,
  };

  return updateState(
    {
      ...state,
      supervisedRuns: [run, ...(state.supervisedRuns ?? [])],
    },
    now,
    {
      type: "supervised_run_recorded",
      at: now,
      missionId: run.missionId,
      supervisedRunId: run.id,
      summary: `${run.command} exited ${run.exitCode}.`,
    },
  );
}

export function getKlemmStatus(state, { now = new Date().toISOString() } = {}) {
  const activeMissions = state.missions.filter((mission) => mission.status === "active" && mission.expiresAt > now);
  const activeMissionIds = new Set(activeMissions.map((mission) => mission.id));
  const activeAgents = state.agents.filter((agent) => agent.status === "active" && activeMissionIds.has(agent.missionId));

  return {
    activeMissionCount: activeMissions.length,
    activeAgentCount: activeAgents.length,
    queuedCount: state.queue.filter((item) => item.status === "queued").length,
    memoryCount: state.memories.length,
    pendingMemoryReviewCount: state.memories.filter((memory) => memory.status === "pending_review").length,
    eventCount: (state.agentEvents ?? []).length,
    importCount: (state.imports ?? []).length,
    supervisedRunCount: (state.supervisedRuns ?? []).length,
    osObservationCount: (state.osObservations ?? []).length,
    recentDecisionCount: state.decisions.length,
    auditEventCount: state.auditEvents.length,
  };
}

export function summarizeDebrief(state, { missionId } = {}) {
  const mission = missionId ? state.missions.find((item) => item.id === missionId) : activeMission(state) ?? state.missions[0];
  const decisions = mission ? state.decisions.filter((decision) => decision.missionId === mission.id) : state.decisions;
  const events = mission ? (state.agentEvents ?? []).filter((event) => event.missionId === mission.id) : state.agentEvents ?? [];
  const queued = decisions.filter((decision) => decision.decision === "queue").length;
  const allowed = decisions.filter((decision) => decision.decision === "allow").length;
  const rewritten = decisions.filter((decision) => decision.decision === "rewrite").length;
  const denied = decisions.filter((decision) => decision.status === "denied").length;
  const paused = decisions.filter((decision) => decision.decision === "pause").length;
  const killed = decisions.filter((decision) => decision.decision === "kill").length;
  const unresolved = state.queue.filter((item) => item.status === "queued" && (!mission || item.missionId === mission.id));
  const memoryCandidates = state.memories.filter((memory) => memory.status === "pending_review").length;
  const supervisedRuns = mission ? (state.supervisedRuns ?? []).filter((run) => run.missionId === mission.id) : state.supervisedRuns ?? [];
  const osObservations = mission ? (state.osObservations ?? []).filter((observation) => observation.missionId === mission.id) : state.osObservations ?? [];
  const lines = [
    "Klemm debrief",
    `Mission: ${mission?.id ?? "all"}`,
    `Goal: ${mission?.goal ?? "No active mission"}`,
    `Events: ${events.length}`,
    `Allowed: ${allowed}`,
    `Rewrites: ${rewritten}`,
    `Queued: ${queued}`,
    `Denied: ${denied}`,
    `Paused: ${paused}`,
    `Killed: ${killed}`,
    `Unresolved queue: ${unresolved.length}`,
    `Memory candidates: ${memoryCandidates}`,
    `Supervised runs: ${supervisedRuns.length}`,
    `OS observations: ${osObservations.length}`,
    "Recent events:",
    ...events.slice(0, 5).map((event) => `- ${event.id} ${event.type}: ${event.summary}`),
    "Recent interventions:",
    ...decisions
      .slice(0, 8)
      .map((decision) => `- ${decision.id} ${decision.decision}/${decision.status}: ${decision.actor} ${decision.actionType} ${decision.target}`),
  ];

  return lines.join("\n");
}

export function renderKlemmDashboard(state, { missionId, now = new Date().toISOString() } = {}) {
  const mission = missionId ? state.missions.find((item) => item.id === missionId) : activeMission(state) ?? state.missions[0];
  const status = getKlemmStatus(state, { now });
  const agents = mission
    ? state.agents.filter((agent) => agent.missionId === mission.id && agent.status === "active")
    : state.agents.filter((agent) => agent.status === "active");
  const unresolved = state.queue.filter((item) => item.status === "queued" && (!mission || item.missionId === mission.id));
  const decisions = mission ? state.decisions.filter((decision) => decision.missionId === mission.id) : state.decisions;
  const events = mission ? (state.agentEvents ?? []).filter((event) => event.missionId === mission.id) : state.agentEvents ?? [];
  const supervisedRuns = mission ? (state.supervisedRuns ?? []).filter((run) => run.missionId === mission.id) : state.supervisedRuns ?? [];
  const osObservations = mission ? (state.osObservations ?? []).filter((observation) => observation.missionId === mission.id) : state.osObservations ?? [];

  return [
    "Klemm",
    `Mission: ${mission?.goal ?? "No active mission"}`,
    `Hub: ${mission?.hub ?? "none"}`,
    `Agents: ${agents.length} active`,
    `Queue: ${unresolved.length} unresolved`,
    `Memory: ${status.memoryCount} candidates (${status.pendingMemoryReviewCount} pending review)`,
    `Events: ${events.length}`,
    `Supervised runs: ${supervisedRuns.length}`,
    `OS observations: ${osObservations.length}`,
    "Recent interventions",
    ...(decisions.length === 0
      ? ["- none"]
      : decisions.slice(0, 5).map((decision) => `- ${decision.id} ${decision.decision}: ${decision.actionType} ${decision.target}`)),
    "Recent events",
    ...(events.length === 0 ? ["- none"] : events.slice(0, 5).map((event) => `- ${event.type}: ${event.summary}`)),
  ].join("\n");
}

export function buildCodexContext(state, { missionId, now = new Date().toISOString() } = {}) {
  const mission = missionId ? state.missions.find((item) => item.id === missionId) : activeMission(state) ?? state.missions[0];
  const queue = state.queue.filter((item) => item.status === "queued" && (!mission || item.missionId === mission.id));
  const recentEvents = (state.agentEvents ?? []).filter((event) => !mission || event.missionId === mission.id).slice(0, 8);
  const recentDecisions = state.decisions.filter((decision) => !mission || decision.missionId === mission.id).slice(0, 8);
  const hubAgent = state.agents.find((agent) => agent.id === "agent-codex" && (!mission || agent.missionId === mission.id));

  return {
    generatedAt: now,
    mission,
    hubAgent,
    queue,
    recentEvents,
    recentDecisions,
    memoryCandidates: state.memories.filter((memory) => memory.status === "pending_review").slice(0, 8),
    trustedMemories: state.memories.filter((memory) => memory.status === "approved" || memory.status === "pinned").slice(0, 8),
    supervisedRuns: (state.supervisedRuns ?? []).filter((run) => !mission || run.missionId === mission.id).slice(0, 5),
    osObservations: (state.osObservations ?? []).filter((observation) => !mission || observation.missionId === mission.id).slice(0, 5),
  };
}

export function normalizeActionProposal(proposal = {}, mission, now = new Date().toISOString()) {
  return {
    id: proposal.id ?? `decision-${compactTimestamp(now)}`,
    missionId: proposal.missionId ?? mission?.id,
    actor: proposal.actor ?? "unknown_agent",
    actionType: normalizeActionType(proposal.actionType ?? proposal.type ?? "unknown"),
    target: proposal.target ?? "",
    reversibility: proposal.reversibility ?? inferReversibility(proposal),
    privacyExposure: proposal.privacyExposure ?? "none",
    externality: proposal.externality ?? "local_only",
    moneyImpact: Boolean(proposal.moneyImpact),
    legalImpact: Boolean(proposal.legalImpact),
    reputationImpact: Boolean(proposal.reputationImpact),
    credentialImpact: Boolean(proposal.credentialImpact),
    missionRelevance: proposal.missionRelevance ?? "unknown",
    suggestedRewrite: proposal.suggestedRewrite ?? "",
    createdAt: now,
  };
}

export function classifyAuthority(proposal, mission = {}, matchedPolicies = []) {
  const reasons = [];
  const highRisk =
    isBlockedAction(proposal.actionType, mission) ||
    matchedPolicies.length > 0 ||
    proposal.credentialImpact ||
    proposal.moneyImpact ||
    proposal.legalImpact ||
    proposal.reputationImpact ||
    isHighRiskExternality(proposal.externality) ||
    proposal.actionType.includes("delete") ||
    proposal.actionType === "destructive_command" ||
    /(^|\s)(rm|sudo|chmod|chown)\b.*(-rf|777|\/)/i.test(proposal.target);

  if (isBlockedAction(proposal.actionType, mission)) reasons.push(`${proposal.actionType} is blocked by the current mission lease`);
  if (matchedPolicies.length > 0) {
    reasons.push(`memory policy requires user review: ${matchedPolicies.map((policy) => policy.id).join(", ")}`);
  }
  if (proposal.credentialImpact) reasons.push("credential impact");
  if (proposal.moneyImpact) reasons.push("financial impact");
  if (proposal.legalImpact) reasons.push("legal impact");
  if (proposal.reputationImpact) reasons.push("reputational impact");
  if (isHighRiskExternality(proposal.externality)) reasons.push(`external account or publication surface: ${proposal.externality}`);
  if (/oauth/i.test(`${proposal.actionType} ${proposal.target}`)) reasons.push("OAuth or external account permission change");

  if (highRisk) {
    return {
      decision: "queue",
      riskLevel: "high",
      reason: sentence(reasons, "High-risk action exceeds current Klemm authority and needs user review."),
    };
  }

  if (proposal.suggestedRewrite && mission?.rewriteAllowed !== false) {
    return {
      decision: "rewrite",
      riskLevel: "medium",
      reason: "Klemm can preserve the mission while narrowing this reversible action.",
      rewrite: proposal.suggestedRewrite,
    };
  }

  if (proposal.missionRelevance === "unrelated" || proposal.missionRelevance === "unknown") {
    return {
      decision: "pause",
      riskLevel: "medium",
      reason: "Mission relevance is not clear enough to continue while the user is away.",
    };
  }

  return {
    decision: "allow",
    riskLevel: "low",
    reason: "Local, reversible action matches the active mission lease.",
  };
}

function activeMission(state) {
  return state.missions.find((mission) => mission.status === "active");
}

function extractMemoryExportMessages(text) {
  const rawText = String(text ?? "");
  try {
    return extractMessagesFromJson(JSON.parse(rawText));
  } catch {
    return rawText
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((content) => ({ role: "unknown", content }));
  }
}

function extractMessagesFromJson(value) {
  const messages = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;

    if (typeof node.content === "string") {
      messages.push({ role: node.role ?? "unknown", content: node.content });
    } else if (Array.isArray(node.content)) {
      const text = node.content
        .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
        .join("\n")
        .trim();
      if (text) messages.push({ role: node.role ?? "unknown", content: text });
    } else if (typeof node.text === "string") {
      messages.push({ role: node.role ?? "unknown", content: node.text });
    } else if (node.message?.content?.parts) {
      const text = node.message.content.parts.join("\n").trim();
      if (text) messages.push({ role: node.message.author?.role ?? "unknown", content: text });
    }

    for (const key of ["conversations", "messages", "mapping", "children"]) {
      if (node[key]) visit(Array.isArray(node[key]) ? node[key] : Object.values(node[key]));
    }
  };

  visit(value);
  return messages;
}

function normalizeEventType(type) {
  const value = String(type ?? "agent_event").trim().toLowerCase().replaceAll("-", "_");
  const known = new Set([
    "agent_started",
    "tool_call_planned",
    "command_planned",
    "file_change_detected",
    "external_action_requested",
    "agent_finished",
    "user_returned",
    "os_observation_alert",
    "agent_event",
  ]);
  return known.has(value) ? value : "agent_event";
}

function findMission(state, missionId) {
  if (missionId) return state.missions.find((mission) => mission.id === missionId);
  return activeMission(state);
}

function updateState(state, now, event) {
  return {
    ...state,
    updatedAt: now,
    auditEvents: [
      {
        id: `audit-${String((state.auditEvents?.length ?? 0) + 1).padStart(3, "0")}`,
        ...event,
      },
      ...(state.auditEvents ?? []),
    ],
  };
}

function normalizeList(value, fallback) {
  if (value === undefined || value === null || value === "") return [...fallback];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function withoutId(items, id) {
  return (items ?? []).filter((item) => item.id !== id);
}

function compactTimestamp(now) {
  return String(now).replace(/[-:.TZ]/g, "").slice(0, 14);
}

function normalizeActionType(value) {
  const raw = String(value).trim().toLowerCase().replaceAll("-", "_");
  if (raw === "git_push") return raw;
  if (raw === "oauth_scope_change") return raw;
  if (raw === "credential_change") return raw;
  if (raw === "external_send") return raw;
  if (raw === "delete_data") return raw;
  if (raw === "command") return raw;
  return raw || "unknown";
}

function inferReversibility(proposal) {
  return /rm|delete|push|send|pay|submit|oauth|credential/i.test(`${proposal.actionType ?? ""} ${proposal.target ?? ""}`)
    ? "hard_to_reverse"
    : "reversible";
}

function isBlockedAction(actionType, mission = {}) {
  return (mission.blockedActions ?? DEFAULT_BLOCKED_ACTIONS).includes(actionType);
}

function isHighRiskExternality(externality) {
  return externality && externality !== "local_only" && externality !== "none";
}

function findPolicyMatches(state, proposal) {
  const haystack = `${proposal.actionType} ${proposal.target} ${proposal.externality}`.toLowerCase();
  return (state.memories ?? [])
    .filter((memory) => memory.memoryClass === "authority_boundary")
    .filter((memory) => memory.status === "approved" || memory.status === "pinned")
    .filter((memory) => memoryPolicyMatches(memory.text, haystack))
    .map((memory) => ({
      id: memory.id,
      source: memory.sourceRef ?? memory.source,
      memoryClass: memory.memoryClass,
      text: memory.text,
    }));
}

function memoryPolicyMatches(text, haystack) {
  const policy = String(text ?? "").toLowerCase();
  if (/\bdeploy|production|prod\b/.test(policy) && /\bdeploy|production|prod\b/.test(haystack)) return true;
  if (/\bpush|github|publish code\b/.test(policy) && /\bgit_push|git push|github|publish/i.test(haystack)) return true;
  if (/\bsend|email|slack|publish\b/.test(policy) && /\bexternal_send|send|email|slack|publish\b/.test(haystack)) return true;
  if (/\boauth|credential|secret|token\b/.test(policy) && /\boauth|credential|secret|token\b/.test(haystack)) return true;
  if (/\bfinancial|money|payment|invoice|bank\b/.test(policy) && /\bfinancial|money|payment|invoice|bank\b/.test(haystack)) return true;
  if (/\bdelete|remove|destructive\b/.test(policy) && /\bdelete|remove|rm |destructive\b/.test(haystack)) return true;
  return false;
}

function sentence(parts, fallback) {
  return parts.length > 0 ? `${parts.join("; ")}.` : fallback;
}

function normalizeMemoryReviewStatus(status) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "pinned") return "pinned";
  throw new Error("memory review status must be approved, rejected, or pinned");
}

function normalizeMemoryText(text) {
  return String(text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function clipTranscript(text) {
  const value = String(text ?? "");
  return value.length > 4000 ? `${value.slice(0, 4000)}\n[truncated]` : value;
}

function normalizeOutcome(outcome) {
  if (outcome === "approved") return "approved";
  if (outcome === "denied") return "denied";
  if (outcome === "rewritten") return "rewritten";
  if (outcome === "held") return "held";
  throw new Error("outcome must be approved, denied, rewritten, or held");
}

function classifyMemoryLine(line) {
  if (/\b(do not|don't|never|requires approval|without approval|blocked|boundary|boundaries)\b/i.test(line)) {
    return "authority_boundary";
  }
  if (/\b(prefer|always|working style|terminal-first|cli-first)\b/i.test(line)) {
    return "standing_preference";
  }
  if (/\b(love|hate|interest|building|project|ambitious|agentic)\b/i.test(line)) {
    return "personality_interest";
  }
  if (/\b(customer|client|relationship|accounting|connector)\b/i.test(line)) {
    return "relationship_context";
  }
  return null;
}

function inferMemoryConfidence(line, memoryClass) {
  if (/\b(always|never|do not|don't|without approval)\b/i.test(line)) return 0.9;
  if (memoryClass === "authority_boundary") return 0.82;
  return 0.72;
}
