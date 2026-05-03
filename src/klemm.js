import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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
    memorySources: [],
    memoryQuarantine: [],
    contextSyncSources: [],
    contextSyncRuns: [],
    setupRuns: [],
    onboardingProfiles: [],
    watchPaths: [],
    adapterClients: [],
    schemaMigrations: [],
    policies: [],
    imports: [],
    supervisedRuns: [],
    osObservations: [],
    agentActivities: [],
    alignmentReports: [],
    agentInterventions: [],
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
    authorityOverrides: normalizeAuthorityOverrides(options.authorityOverrides),
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
    authorityVersion: authority.authorityVersion,
    actionCategory: authority.actionCategory,
    riskScore: authority.riskScore,
    riskFactors: authority.riskFactors,
    explanation: authority.explanation,
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

export function simulatePolicyDecision(state, proposal = {}) {
  const now = proposal.now ?? new Date().toISOString();
  const mission = findMission(state, proposal.missionId);
  const normalized = normalizeActionProposal(proposal, mission, now);
  const matchedPolicies = findPolicyMatches(state, normalized);
  const authority = classifyAuthority(normalized, mission, matchedPolicies);
  return {
    ...authority,
    id: normalized.id,
    missionId: normalized.missionId,
    actor: normalized.actor,
    actionType: normalized.actionType,
    target: normalized.target,
    matchedPolicies,
    proposal: normalized,
    persisted: false,
  };
}

export function addAdapterClient(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `adapter-${compactTimestamp(now)}-${(state.adapterClients?.length ?? 0) + 1}`;
  const client = {
    id,
    token: options.token,
    protocolVersions: normalizeNumberList(options.protocolVersions ?? options.versions, [1]),
    permissions: normalizeList(options.permissions, ["record_adapter_envelope"]),
    status: options.status ?? "active",
    createdAt: now,
    updatedAt: now,
  };

  return updateState(
    {
      ...state,
      adapterClients: [client, ...withoutId(state.adapterClients ?? [], id)],
    },
    now,
    {
      type: "adapter_client_added",
      at: now,
      adapterClientId: id,
      summary: `${id} adapter client added.`,
    },
  );
}

export function addStructuredPolicy(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `policy-${compactTimestamp(now)}-${(state.policies?.length ?? 0) + 1}`;
  const policy = {
    id,
    name: options.name ?? id,
    condition: {
      actionTypes: normalizeList(options.condition?.actionTypes, []),
      targetIncludes: normalizeList(options.condition?.targetIncludes, []),
      externalities: normalizeList(options.condition?.externalities, []),
    },
    effect: normalizePolicyEffect(options.effect ?? "queue"),
    severity: options.severity ?? "medium",
    source: options.source ?? "manual",
    sourceRef: options.sourceRef ?? options.source ?? "manual",
    sourceMemoryId: options.sourceMemoryId,
    status: options.status ?? "active",
    confidence: options.confidence ?? 1,
    createdAt: now,
  };

  return updateState(
    {
      ...state,
      policies: [policy, ...withoutId(state.policies ?? [], id)],
    },
    now,
    {
      type: "policy_added",
      at: now,
      policyId: id,
      summary: `${policy.name} policy added with ${policy.effect} effect.`,
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

export function importMemorySource(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const provider = options.source ?? options.provider ?? "unknown";
  const sourceRef = options.sourceRef ?? provider;
  const payload = options.payload ?? options.text ?? "";
  const next = ingestMemoryExport(state, {
    source: provider,
    sourceRef,
    text: payload,
    now,
  });
  const sourceRecord = {
    id: options.id ?? `memory-source-${compactTimestamp(now)}-${(state.memorySources?.length ?? 0) + 1}`,
    provider,
    sourceRef,
    importedAt: now,
    messageCount: next.imports[0]?.messageCount ?? 0,
    distilledCount: next.imports[0]?.distilledCount ?? 0,
    rejectedCount: next.imports[0]?.rejectedCount ?? 0,
  };

  return updateState(
    {
      ...next,
      memorySources: [sourceRecord, ...(next.memorySources ?? [])],
    },
    now,
    {
      type: "memory_source_imported",
      at: now,
      memorySourceId: sourceRecord.id,
      summary: `${provider} memory source imported from ${sourceRef}.`,
    },
  );
}

export function importContextSource(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const provider = normalizeContextProvider(options.provider ?? options.source ?? "unknown");
  const sourceRef = options.sourceRef ?? options.filePath ?? options.file ?? provider;
  const records = extractContextRecords(provider, {
    payload: options.payload ?? options.text ?? "",
    filePath: options.filePath,
    sourceRef,
  });
  const distilled = distillContextRecords(state, {
    provider,
    sourceRef,
    records,
    now,
  });
  const sourceRecord = {
    id: options.id ?? `memory-source-${compactTimestamp(now)}-${(state.memorySources?.length ?? 0) + 1}`,
    provider,
    sourceRef,
    importedAt: now,
    recordCount: records.length,
    messageCount: records.length,
    distilledCount: distilled.distilledCount,
    quarantinedCount: distilled.quarantinedCount,
    rejectedCount: distilled.quarantinedCount,
    duplicateCount: distilled.duplicateCount,
  };

  return updateState(
    {
      ...distilled.state,
      memorySources: [sourceRecord, ...(distilled.state.memorySources ?? [])],
    },
    now,
    {
      type: "context_source_imported",
      at: now,
      memorySourceId: sourceRecord.id,
      summary: `${provider} context source imported from ${sourceRef}.`,
    },
  );
}

export function promoteMemoryToPolicy(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const memoryId = options.memoryId;
  if (!memoryId) throw new Error("memoryId is required");
  const memory = (state.memories ?? []).find((item) => item.id === memoryId);
  if (!memory) throw new Error(`Memory not found: ${memoryId}`);
  const policyState = addStructuredPolicy(state, {
    id: options.id ?? `policy-from-${memory.id}`,
    name: options.name ?? oneLineText(memory.text, 96),
    effect: options.effect ?? "queue",
    severity: options.severity ?? (memory.memoryClass === "authority_boundary" ? "high" : "medium"),
    source: "memory",
    sourceRef: memory.sourceRef ?? memory.source,
    sourceMemoryId: memory.id,
    confidence: memory.confidence,
    condition: {
      actionTypes: options.actionTypes,
      targetIncludes: options.targetIncludes,
      externalities: options.externalities,
    },
    now,
  });

  return reviewMemory(policyState, {
    memoryId,
    status: memory.status === "pinned" ? "pinned" : "approved",
    note: options.note ?? "Promoted to structured authority policy.",
    now,
  });
}

export function buildUserModelSummary(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const includePending = options.includePending ?? true;
  const memories = (state.memories ?? []).filter((memory) =>
    memory.status === "approved" || memory.status === "pinned" || (includePending && memory.status === "pending_review"),
  );
  const sections = {
    identityPersonality: memories.filter((memory) => memory.memoryClass === "personality_interest"),
    interestsProjects: memories.filter((memory) => ["project_context", "personality_interest"].includes(memory.memoryClass)),
    workingStyle: memories.filter((memory) => memory.memoryClass === "standing_preference"),
    authorityBoundaries: memories.filter((memory) => memory.memoryClass === "authority_boundary"),
    relationshipContext: memories.filter((memory) => memory.memoryClass === "relationship_context"),
    priorCorrections: memories.filter((memory) => memory.memoryClass === "prior_correction"),
  };
  const lines = [
    "Klemm user model",
    `Generated: ${now}`,
    `Reviewed memories: ${(state.memories ?? []).filter((memory) => memory.status === "approved" || memory.status === "pinned").length}`,
    `Pending candidates included: ${includePending ? "yes" : "no"}`,
    "",
    "Working style",
    ...formatUserModelSection(sections.workingStyle),
    "",
    "Authority boundaries",
    ...formatUserModelSection(sections.authorityBoundaries),
    "",
    "Interests and projects",
    ...formatUserModelSection(sections.interestsProjects),
    "",
    "Relationship context",
    ...formatUserModelSection(sections.relationshipContext),
    "",
    "Prior corrections",
    ...formatUserModelSection(sections.priorCorrections),
  ];

  return {
    generatedAt: now,
    sections,
    text: lines.join("\n"),
  };
}

export function searchMemories(state, options = {}) {
  const terms = String(options.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return [];
  return (state.memories ?? []).filter((memory) => {
    const text = `${memory.text} ${memory.memoryClass} ${memory.source}`.toLowerCase();
    return terms.every((term) => text.includes(term) || stemmedContains(text, term));
  });
}

export function normalizeAgentAdapterEnvelope(input = {}) {
  const type = normalizeAdapterEventType(input.event ?? input.type);
  const missionId = input.missionId;
  const agentId = input.agentId ?? input.actor ?? "unknown_agent";
  const toolName = input.toolCall?.name ?? input.tool ?? "";
  const command = input.toolCall?.arguments?.command ?? input.command ?? "";
  const target = type === "tool_call" ? toolName : input.target ?? command;

  return {
    protocolVersion: Number(input.protocolVersion ?? 1),
    adapterClientId: input.adapterClientId,
    adapterToken: input.adapterToken,
    type,
    missionId,
    agentId,
    summary: input.summary ?? `${type} reported by ${agentId}`,
    activity: {
      missionId,
      agentId,
      type: type === "diff" ? "file_change" : type,
      summary: input.summary ?? `${type} reported by ${agentId}`,
      target,
      command,
      fileChanges: input.diff?.files ?? input.fileChanges ?? [],
      evidence: {
        plan: input.plan,
        toolCall: input.toolCall,
        uncertainty: input.uncertainty,
      },
    },
    validation: input.validation ?? { accepted: true },
    action: command
      ? {
          missionId,
          actor: agentId,
          actionType: "command",
          target: command,
          missionRelevance: "related",
        }
      : null,
  };
}

export function renderLaunchAgentPlist(options = {}) {
  const label = options.label ?? "com.klemm.daemon";
  const program = options.program ?? "klemm";
  const dataDir = options.dataDir ?? "$HOME/Library/Application Support/Klemm";
  const stdoutPath = options.stdoutPath ?? `${dataDir}/logs/klemm-daemon.log`;
  const stderrPath = options.stderrPath ?? `${dataDir}/logs/klemm-daemon.err.log`;
  const programArguments = options.programArguments ?? [
    program,
    "daemon",
    "--host",
    "127.0.0.1",
    "--port",
    "8765",
    "--pid-file",
    `${dataDir}/klemm.pid`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- launchd LaunchAgent for Klemm -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments.map((argument) => `    <string>${escapeXml(argument)}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KLEMM_DATA_DIR</key>
    <string>${escapeXml(dataDir)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>`;
}

export function migrateKlemmState(state, { now = new Date().toISOString(), targetVersion = 2 } = {}) {
  const currentVersion = Number(state.schemaVersion ?? state.version ?? 1);
  const next = {
    ...state,
    version: Math.max(Number(state.version ?? 1), 1),
    schemaVersion: Math.max(currentVersion, targetVersion),
    memories: state.memories ?? [],
    memorySources: state.memorySources ?? [],
    memoryQuarantine: state.memoryQuarantine ?? [],
    contextSyncSources: state.contextSyncSources ?? [],
    contextSyncRuns: state.contextSyncRuns ?? [],
    setupRuns: state.setupRuns ?? [],
    onboardingProfiles: state.onboardingProfiles ?? [],
    watchPaths: state.watchPaths ?? [],
    schemaMigrations: state.schemaMigrations ?? [],
    policies: state.policies ?? [],
    agentActivities: state.agentActivities ?? [],
    alignmentReports: state.alignmentReports ?? [],
    agentInterventions: state.agentInterventions ?? [],
  };
  if (currentVersion >= targetVersion && (state.contextSyncSources ?? null) && (state.schemaMigrations ?? null)) return next;

  return updateState(
    {
      ...next,
      schemaMigrations: [
        {
          id: `migration-${compactTimestamp(now)}-${(next.schemaMigrations?.length ?? 0) + 1}`,
          fromVersion: currentVersion,
          toVersion: targetVersion,
          appliedAt: now,
        },
        ...(next.schemaMigrations ?? []),
      ],
    },
    now,
    {
      type: "schema_migrated",
      at: now,
      summary: `Klemm schema migrated from ${currentVersion} to ${targetVersion}.`,
    },
  );
}

export function addContextSyncSource(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `sync-source-${compactTimestamp(now)}-${(state.contextSyncSources?.length ?? 0) + 1}`;
  const source = {
    id,
    provider: normalizeContextProvider(options.provider ?? "unknown"),
    path: options.path ?? options.filePath,
    sourceRef: options.sourceRef ?? options.path ?? options.provider ?? "unknown",
    enabled: options.enabled ?? true,
    lastChecksum: options.lastChecksum,
    lastImportedAt: options.lastImportedAt,
    lastRunId: options.lastRunId,
    createdAt: options.createdAt ?? now,
    updatedAt: now,
  };

  return updateState(
    {
      ...state,
      contextSyncSources: [source, ...withoutId(state.contextSyncSources ?? [], id)],
    },
    now,
    {
      type: "context_sync_source_added",
      at: now,
      contextSyncSourceId: id,
      summary: `${source.provider} sync source ${id} added.`,
    },
  );
}

export function updateContextSyncSource(state, sourceId, patch = {}, { now = new Date().toISOString() } = {}) {
  return updateState(
    {
      ...state,
      contextSyncSources: (state.contextSyncSources ?? []).map((source) =>
        source.id === sourceId ? { ...source, ...patch, updatedAt: now } : source,
      ),
    },
    now,
    {
      type: "context_sync_source_updated",
      at: now,
      contextSyncSourceId: sourceId,
      summary: `${sourceId} sync source updated.`,
    },
  );
}

export function recordContextSyncRun(state, options = {}) {
  const now = options.finishedAt ?? options.now ?? new Date().toISOString();
  const run = {
    id: options.id ?? `sync-run-${compactTimestamp(now)}-${(state.contextSyncRuns?.length ?? 0) + 1}`,
    sourceId: options.sourceId,
    provider: options.provider,
    sourceRef: options.sourceRef,
    status: options.status ?? "imported",
    checksum: options.checksum,
    importedCount: Number(options.importedCount ?? 0),
    skippedCount: Number(options.skippedCount ?? 0),
    distilledCount: Number(options.distilledCount ?? 0),
    quarantinedCount: Number(options.quarantinedCount ?? 0),
    snapshotPath: options.snapshotPath,
    startedAt: options.startedAt ?? now,
    finishedAt: now,
  };

  return updateState(
    {
      ...state,
      contextSyncRuns: [run, ...(state.contextSyncRuns ?? [])],
    },
    now,
    {
      type: "context_sync_run_recorded",
      at: now,
      contextSyncRunId: run.id,
      summary: `${run.sourceId ?? run.provider} sync ${run.status}.`,
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

export function recordAgentActivity(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const mission = findMission(state, options.missionId);
  const activity = {
    id: options.id ?? `activity-${compactTimestamp(now)}-${(state.agentActivities?.length ?? 0) + 1}`,
    missionId: options.missionId ?? mission?.id,
    agentId: options.agentId ?? options.actor ?? "unknown_agent",
    type: normalizeActivityType(options.type),
    summary: options.summary ?? "Agent activity recorded.",
    target: options.target ?? "",
    command: options.command ?? "",
    exitCode: options.exitCode,
    fileChanges: options.fileChanges ?? [],
    evidence: options.evidence ?? {},
    createdAt: now,
  };

  return updateState(
    {
      ...state,
      agentActivities: [activity, ...(state.agentActivities ?? [])],
    },
    now,
    {
      type: "agent_activity_recorded",
      at: now,
      missionId: activity.missionId,
      agentId: activity.agentId,
      activityId: activity.id,
      summary: `${activity.type}: ${activity.summary}`,
    },
  );
}

export function evaluateAgentAlignment(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const mission = findMission(state, options.missionId);
  const missionId = options.missionId ?? mission?.id;
  const agentId = options.agentId;
  const activities = (state.agentActivities ?? [])
    .filter((activity) => !missionId || activity.missionId === missionId)
    .filter((activity) => !agentId || activity.agentId === agentId)
    .slice(0, 12);
  const evaluation = classifyAlignment({ mission, activities });
  const report = {
    id: options.id ?? `alignment-${compactTimestamp(now)}-${(state.alignmentReports?.length ?? 0) + 1}`,
    missionId,
    agentId: agentId ?? activities[0]?.agentId ?? "unknown_agent",
    state: evaluation.state,
    reason: evaluation.reason,
    confidence: evaluation.confidence,
    evidenceActivityIds: activities.slice(0, 5).map((activity) => activity.id),
    createdAt: now,
  };
  const intervention = buildAgentIntervention(report, evaluation, mission, now, state.agentInterventions?.length ?? 0);
  const next = updateState(
    {
      ...state,
      alignmentReports: [report, ...(state.alignmentReports ?? [])],
      agentInterventions: intervention ? [intervention, ...(state.agentInterventions ?? [])] : state.agentInterventions ?? [],
    },
    now,
    {
      type: "alignment_evaluated",
      at: now,
      missionId,
      agentId: report.agentId,
      alignmentReportId: report.id,
      summary: `${report.agentId} alignment ${report.state}: ${report.reason}`,
    },
  );

  if (!intervention) return next;

  return recordAgentEvent(next, {
    id: `event-${intervention.id}`,
    missionId,
    agentId: "klemm-monitor",
    type: "alignment_intervention",
    summary: `${intervention.type}: ${intervention.message}`,
    payload: {
      alignmentReportId: report.id,
      intervention,
    },
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
    memorySourceCount: (state.memorySources ?? []).length,
    policyCount: (state.policies ?? []).length,
    supervisedRunCount: (state.supervisedRuns ?? []).length,
    osObservationCount: (state.osObservations ?? []).length,
    agentActivityCount: (state.agentActivities ?? []).length,
    alignmentReportCount: (state.alignmentReports ?? []).length,
    activeInterventionCount: (state.agentInterventions ?? []).filter((intervention) => intervention.status === "active").length,
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
  const alignmentReports = mission ? (state.alignmentReports ?? []).filter((report) => report.missionId === mission.id) : state.alignmentReports ?? [];
  const agentInterventions = mission ? (state.agentInterventions ?? []).filter((intervention) => intervention.missionId === mission.id) : state.agentInterventions ?? [];
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
    `Agent activities: ${mission ? (state.agentActivities ?? []).filter((activity) => activity.missionId === mission.id).length : (state.agentActivities ?? []).length}`,
    `Latest alignment: ${alignmentReports[0]?.state ?? "none"}`,
    `Active interventions: ${agentInterventions.filter((intervention) => intervention.status === "active").length}`,
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
  const alignmentReports = mission ? (state.alignmentReports ?? []).filter((report) => report.missionId === mission.id) : state.alignmentReports ?? [];

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
    `Latest alignment: ${alignmentReports[0]?.state ?? "none"}`,
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
    agentActivities: (state.agentActivities ?? []).filter((activity) => !mission || activity.missionId === mission.id).slice(0, 8),
    alignmentReports: (state.alignmentReports ?? []).filter((report) => !mission || report.missionId === mission.id).slice(0, 5),
    agentInterventions: (state.agentInterventions ?? []).filter((intervention) => !mission || intervention.missionId === mission.id).slice(0, 5),
    userModelSummary: buildUserModelSummary(state, { now, includePending: true }),
    contextSync: {
      sources: (state.contextSyncSources ?? []).slice(0, 10),
      runs: (state.contextSyncRuns ?? []).slice(0, 10),
    },
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
  const override = findMissionAuthorityOverride(mission, proposal);
  const policyEffect = strongestPolicyEffect(matchedPolicies);
  const riskFactors = buildRiskFactors(proposal, mission, matchedPolicies, override);
  const riskScore = calculateRiskScore(riskFactors);
  const actionCategory = categorizeAction(proposal.actionType);
  if (override?.effect === "allow") {
    const reason = override.reason ?? "Mission authority override allows this action.";
    return {
      authorityVersion: "policy-v2",
      decision: "allow",
      riskLevel: riskScore >= 70 ? "high" : "medium",
      riskScore: Math.min(riskScore, 74),
      riskFactors,
      actionCategory,
      reason,
      explanation: buildAuthorityExplanation({ proposal, mission, matchedPolicies, riskFactors, summary: reason }),
    };
  }

  const reasons = [];
  const highRisk =
    policyEffect === "deny" ||
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
    const decision = policyEffect === "deny" ? "deny" : "queue";
    const riskLevel = policyEffect === "deny" ? "critical" : "high";
    const denyPolicy = policyEffect === "deny" ? matchedPolicies.find((policy) => policy.effect === "deny") : null;
    const baseReason = sentence(reasons, "High-risk action exceeds current Klemm authority and needs user review.");
    const reason = denyPolicy ? `${denyPolicy.text}: ${baseReason}` : baseReason;
    return {
      authorityVersion: "policy-v2",
      decision,
      riskLevel,
      riskScore,
      riskFactors,
      actionCategory,
      reason,
      explanation: buildAuthorityExplanation({ proposal, mission, matchedPolicies, riskFactors, summary: reason }),
    };
  }

  if (proposal.suggestedRewrite && mission?.rewriteAllowed !== false) {
    const reason = "Klemm can preserve the mission while narrowing this reversible action.";
    return {
      authorityVersion: "policy-v2",
      decision: "rewrite",
      riskLevel: "medium",
      riskScore: Math.max(riskScore, 45),
      riskFactors,
      actionCategory,
      reason,
      explanation: buildAuthorityExplanation({ proposal, mission, matchedPolicies, riskFactors, summary: reason }),
      rewrite: proposal.suggestedRewrite,
    };
  }

  if (proposal.missionRelevance === "unrelated" || proposal.missionRelevance === "unknown") {
    const reason = "Mission relevance is not clear enough to continue while the user is away.";
    return {
      authorityVersion: "policy-v2",
      decision: "pause",
      riskLevel: "medium",
      riskScore: Math.max(riskScore, 50),
      riskFactors,
      actionCategory,
      reason,
      explanation: buildAuthorityExplanation({ proposal, mission, matchedPolicies, riskFactors, summary: reason }),
    };
  }

  const reason = "Local, reversible action matches the active mission lease.";
  return {
    authorityVersion: "policy-v2",
    decision: "allow",
    riskLevel: "low",
    riskScore,
    riskFactors,
    actionCategory,
    reason,
    explanation: buildAuthorityExplanation({ proposal, mission, matchedPolicies, riskFactors, summary: reason }),
  };
}

function activeMission(state) {
  return state.missions.find((mission) => mission.status === "active");
}

function extractContextRecords(provider, { payload = "", filePath, sourceRef } = {}) {
  if (provider === "chrome_history" && filePath && !String(payload ?? "").trim() && looksLikeSqliteDatabase(filePath)) {
    return extractChromeSqliteHistory(filePath, sourceRef);
  }
  const text = filePath && !String(payload ?? "").trim() ? readFileSync(filePath, "utf8") : String(payload ?? "");
  if (provider === "chatgpt") return extractChatGptRecords(text, sourceRef);
  if (provider === "claude") return extractClaudeRecords(text, sourceRef);
  if (provider === "codex") return extractCodexRecords(text, sourceRef);
  if (provider === "chrome_history") return extractChromeHistoryRecords(text, sourceRef);
  if (provider === "git_history") return extractGitHistoryRecords(text, sourceRef);
  return extractMemoryExportMessages(text).map((message, index) => ({
    id: `${sourceRef}:${index}`,
    provider,
    sourceRef,
    role: message.role,
    content: message.content,
    evidence: {
      provider,
      sourceRef,
      messageId: `${sourceRef}:${index}`,
    },
  }));
}

function extractChatGptRecords(text, sourceRef) {
  const parsed = parseJsonOrNull(text);
  if (!parsed) return extractPlainTextRecords("chatgpt", text, sourceRef);
  const conversations = Array.isArray(parsed?.conversations) ? parsed.conversations : Array.isArray(parsed) ? parsed : [parsed];
  const records = [];
  for (const conversation of conversations) {
    if (conversation?.mapping && typeof conversation.mapping === "object") {
      for (const [nodeId, node] of Object.entries(conversation.mapping)) {
        const message = node?.message;
        const content = extractMessageText(message?.content);
        if (!content) continue;
        records.push({
          id: `${conversation.id ?? sourceRef}:${nodeId}`,
          provider: "chatgpt",
          sourceRef,
          role: message?.author?.role ?? "unknown",
          content,
          createdAt: unixSecondsToIso(message?.create_time ?? conversation.create_time),
          evidence: {
            provider: "chatgpt",
            sourceRef,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            messageId: nodeId,
          },
        });
      }
      continue;
    }
    const content = extractMessageText(conversation.content ?? conversation.text ?? conversation.message?.content);
    if (!content) continue;
    records.push({
      id: `${conversation.id ?? sourceRef}:${records.length}`,
      provider: "chatgpt",
      sourceRef,
      role: conversation.role ?? conversation.author?.role ?? "unknown",
      content,
      createdAt: unixSecondsToIso(conversation.create_time),
      evidence: {
        provider: "chatgpt",
        sourceRef,
        conversationId: conversation.conversation_id ?? conversation.id,
        conversationTitle: conversation.title,
        messageId: conversation.message_id ?? `${records.length}`,
      },
    });
  }
  return records.length > 0 ? records : extractMemoryExportMessages(text).map((message, index) => ({
    id: `${sourceRef}:${index}`,
    provider: "chatgpt",
    sourceRef,
    role: message.role,
    content: message.content,
    evidence: { provider: "chatgpt", sourceRef, messageId: `${index}` },
  }));
}

function extractClaudeRecords(text, sourceRef) {
  const parsed = parseJsonOrNull(text);
  if (!parsed) return extractPlainTextRecords("claude", text, sourceRef);
  const conversations = Array.isArray(parsed) ? parsed : [parsed];
  const records = [];
  for (const conversation of conversations) {
    const messages = conversation.chat_messages ?? conversation.messages ?? [];
    for (const [index, message] of messages.entries()) {
      const content = extractMessageText(message.text ?? message.content);
      if (!content) continue;
      records.push({
        id: `${conversation.uuid ?? conversation.id ?? sourceRef}:${index}`,
        provider: "claude",
        sourceRef,
        role: message.sender ?? message.role ?? "unknown",
        content,
        createdAt: message.created_at ?? message.createdAt,
        evidence: {
          provider: "claude",
          sourceRef,
          conversationId: conversation.uuid ?? conversation.id,
          conversationTitle: conversation.name ?? conversation.title,
          messageId: `${conversation.uuid ?? conversation.id ?? sourceRef}:${index}`,
        },
      });
    }
  }
  return records;
}

function extractCodexRecords(text, sourceRef) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const records = [];
  for (const [index, line] of lines.entries()) {
    const parsed = parseJsonOrNull(line);
    if (!parsed) {
      records.push(...extractPlainTextRecords("codex", line, sourceRef, index));
      continue;
    }
    const content = extractMessageText(parsed.message ?? parsed.content ?? parsed.text);
    if (!content) continue;
    records.push({
      id: parsed.id ?? `${parsed.session_id ?? parsed.sessionId ?? sourceRef}:${index}`,
      provider: "codex",
      sourceRef,
      role: parsed.role ?? "unknown",
      content,
      createdAt: parsed.created_at ?? parsed.createdAt,
      evidence: {
        provider: "codex",
        sourceRef,
        sessionId: parsed.session_id ?? parsed.sessionId,
        messageId: parsed.id ?? `${index}`,
      },
    });
  }
  if (records.length > 0) return records;
  return extractPlainTextRecords("codex", text, sourceRef);
}

function extractChromeHistoryRecords(text, sourceRef) {
  const parsed = parseJsonOrNull(text);
  if (Array.isArray(parsed)) {
    return parsed.map((entry, index) => chromeHistoryRecord(entry, index, sourceRef)).filter(Boolean);
  }
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [url, title = ""] = line.includes(",") ? line.split(/,(.*)/s) : [line, ""];
      return chromeHistoryRecord({ url, title }, index, sourceRef);
    })
    .filter(Boolean);
}

function extractChromeSqliteHistory(filePath, sourceRef) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    return db
      .prepare("SELECT url, title, CAST(last_visit_time AS TEXT) AS last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 500")
      .all()
      .map((entry, index) => chromeHistoryRecord(entry, index, sourceRef))
      .filter(Boolean);
  } finally {
    db.close();
  }
}

function extractGitHistoryRecords(text, sourceRef) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|");
      const [hash, date, author, ...subjectParts] = parts.length >= 4 ? parts : [`commit-${index}`, "", "", line];
      const subject = subjectParts.join("|").trim();
      return {
        id: `${sourceRef}:${hash || index}`,
        provider: "git_history",
        sourceRef,
        role: "git",
        content: subject ? `Git commit ${String(hash).slice(0, 12)}: ${subject}` : line,
        createdAt: date || undefined,
        evidence: {
          provider: "git_history",
          sourceRef,
          commit: hash,
          author,
          date,
        },
      };
    });
}

function distillContextRecords(state, { provider, sourceRef, records, now }) {
  const memories = [];
  const quarantine = [];
  const rejected = [];
  const seenMemoryTexts = new Set((state.memories ?? []).map((memory) => normalizeMemoryText(memory.text)));
  let duplicateCount = 0;

  for (const record of records) {
    const text = String(record.content ?? "").trim();
    if (!text) continue;
    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text))) {
      const quarantined = {
        id: `quarantine-${compactTimestamp(now)}-${(state.memoryQuarantine?.length ?? 0) + quarantine.length + 1}`,
        provider,
        source: provider,
        sourceRef,
        text,
        reason: "prompt_injection",
        evidence: record.evidence ?? { provider, sourceRef },
        quarantinedAt: now,
      };
      quarantine.push(quarantined);
      rejected.push({
        id: `rejected-memory-${compactTimestamp(now)}-${(state.rejectedMemoryInputs?.length ?? 0) + rejected.length + 1}`,
        source: provider,
        sourceRef,
        text,
        reason: "Rejected likely prompt injection in imported user history.",
        rejectedAt: now,
      });
      continue;
    }

    const memoryClass = classifyMemoryLine(text);
    if (!memoryClass) continue;
    const normalizedText = normalizeMemoryText(text);
    if (seenMemoryTexts.has(normalizedText)) {
      duplicateCount += 1;
      continue;
    }
    seenMemoryTexts.add(normalizedText);
    memories.push({
      id: `memory-${compactTimestamp(now)}-${(state.memories?.length ?? 0) + memories.length + 1}`,
      memoryClass,
      text,
      source: provider,
      sourceRef,
      confidence: inferMemoryConfidence(text, memoryClass),
      status: "pending_review",
      evidence: {
        provider,
        sourceRef,
        ...(record.evidence ?? {}),
      },
      createdAt: now,
    });
  }

  return {
    state: updateState(
      {
        ...state,
        memories: [...memories, ...(state.memories ?? [])],
        memoryQuarantine: [...quarantine, ...(state.memoryQuarantine ?? [])],
        rejectedMemoryInputs: [...rejected, ...(state.rejectedMemoryInputs ?? [])],
        lastMemoryDistillation: {
          duplicateCount,
          distilledCount: memories.length,
          rejectedCount: rejected.length,
        },
      },
      now,
      {
        type: "context_memory_distilled",
        at: now,
        summary: `${memories.length} memory item(s) distilled from ${provider}; ${quarantine.length} quarantined.`,
      },
    ),
    distilledCount: memories.length,
    quarantinedCount: quarantine.length,
    duplicateCount,
  };
}

function extractPlainTextRecords(provider, text, sourceRef, offset = 0) {
  return String(text ?? "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content, index) => ({
      id: `${sourceRef}:${offset + index}`,
      provider,
      sourceRef,
      role: "unknown",
      content,
      evidence: {
        provider,
        sourceRef,
        messageId: `${offset + index}`,
      },
    }));
}

function chromeHistoryRecord(entry, index, sourceRef) {
  if (!entry?.url && !entry?.title) return null;
  const title = String(entry.title ?? "").trim();
  const url = String(entry.url ?? "").trim();
  return {
    id: `${sourceRef}:${entry.id ?? index}`,
    provider: "chrome_history",
    sourceRef,
    role: "browser_history",
    content: [title, url].filter(Boolean).join(" - "),
    evidence: {
      provider: "chrome_history",
      sourceRef,
      url,
      title,
      lastVisitTime: entry.last_visit_time ?? entry.lastVisitTime,
    },
  };
}

function extractMessageText(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => extractMessageText(part)).filter(Boolean).join("\n").trim();
  }
  if (Array.isArray(value.parts)) return value.parts.map((part) => extractMessageText(part)).filter(Boolean).join("\n").trim();
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.content === "string" || Array.isArray(value.content)) return extractMessageText(value.content);
  return "";
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return null;
  }
}

function looksLikeSqliteDatabase(filePath) {
  try {
    return readFileSync(filePath).subarray(0, 16).toString("utf8") === "SQLite format 3\0";
  } catch {
    return false;
  }
}

function unixSecondsToIso(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return new Date(number * 1000).toISOString();
}

function normalizeContextProvider(provider) {
  return String(provider ?? "unknown").trim().toLowerCase().replaceAll("-", "_") || "unknown";
}

function formatUserModelSection(memories) {
  if (memories.length === 0) return ["- none reviewed yet"];
  return memories.slice(0, 12).map((memory) => {
    const status = memory.status === "pending_review" ? "pending" : memory.status;
    return `- ${memory.text} (${status}, ${memory.source})`;
  });
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
    "alignment_intervention",
    "agent_event",
  ]);
  return known.has(value) ? value : "agent_event";
}

function normalizeAdapterEventType(type) {
  const value = String(type ?? "activity").trim().toLowerCase().replaceAll("-", "_");
  const known = new Set(["plan", "tool_call", "diff", "uncertainty", "subagent", "activity"]);
  return known.has(value) ? value : "activity";
}

function normalizeActivityType(type) {
  const value = String(type ?? "activity").trim().toLowerCase().replaceAll("-", "_");
  const known = new Set(["command", "tool_call", "file_change", "browser_action", "subagent", "analysis", "activity"]);
  return known.has(value) ? value : "activity";
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

function normalizeNumberList(value, fallback) {
  return normalizeList(value, fallback).map(Number).filter((item) => Number.isFinite(item));
}

function normalizeAuthorityOverrides(value) {
  if (!value) return [];
  const overrides = Array.isArray(value) ? value : [value];
  return overrides.map((override) => ({
    actionTypes: normalizeList(override.actionTypes, []),
    targetIncludes: normalizeList(override.targetIncludes, []),
    externalities: normalizeList(override.externalities, []),
    effect: normalizePolicyEffect(override.effect ?? "allow"),
    reason: override.reason ?? "",
  }));
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
  const memoryPolicies = (state.memories ?? [])
    .filter((memory) => memory.memoryClass === "authority_boundary")
    .filter((memory) => memory.status === "approved" || memory.status === "pinned")
    .filter((memory) => memoryPolicyMatches(memory.text, haystack))
    .map((memory) => ({
      id: memory.id,
      source: memory.sourceRef ?? memory.source,
      memoryClass: memory.memoryClass,
      text: memory.text,
    }));
  const structuredPolicies = (state.policies ?? [])
    .filter((policy) => policy.status === "active")
    .filter((policy) => structuredPolicyMatches(policy, proposal))
    .map((policy) => ({
      id: policy.id,
      source: policy.sourceRef ?? policy.source,
      memoryClass: "structured_policy",
      text: policy.name,
      effect: policy.effect,
      severity: policy.severity,
      condition: policy.condition,
    }));
  return [...memoryPolicies, ...structuredPolicies];
}

function strongestPolicyEffect(policies) {
  const priority = ["deny", "queue", "pause", "rewrite", "allow"];
  return priority.find((effect) => policies.some((policy) => policy.effect === effect));
}

function buildRiskFactors(proposal, mission = {}, matchedPolicies = [], override) {
  const factors = [];
  if (override) factors.push({ id: "mission_override", weight: override.effect === "allow" ? -25 : 20, detail: override.reason ?? override.effect });
  if (isBlockedAction(proposal.actionType, mission)) factors.push({ id: "mission_blocked_action", weight: 35, detail: proposal.actionType });
  if (matchedPolicies.length > 0) {
    const critical = matchedPolicies.some((policy) => policy.severity === "critical" || policy.effect === "deny");
    factors.push({ id: "matched_policy", weight: critical ? 40 : 30, detail: matchedPolicies.map((policy) => policy.id).join(",") });
  }
  if (proposal.credentialImpact) factors.push({ id: "credential_impact", weight: 45, detail: "credential or OAuth surface" });
  if (proposal.moneyImpact) factors.push({ id: "financial_impact", weight: 40, detail: "money movement or billing surface" });
  if (proposal.legalImpact) factors.push({ id: "legal_impact", weight: 40, detail: "legal surface" });
  if (proposal.reputationImpact) factors.push({ id: "reputation_impact", weight: 35, detail: "public or reputational surface" });
  if (isHighRiskExternality(proposal.externality)) factors.push({ id: "externality", weight: 25, detail: proposal.externality });
  if (proposal.actionType.includes("delete") || proposal.actionType === "destructive_command") factors.push({ id: "destructive", weight: 35, detail: proposal.actionType });
  if (/(^|\s)(rm|sudo|chmod|chown)\b.*(-rf|777|\/)/i.test(proposal.target)) factors.push({ id: "dangerous_command", weight: 45, detail: "dangerous shell pattern" });
  if (proposal.missionRelevance === "unknown" || proposal.missionRelevance === "unrelated") factors.push({ id: "mission_relevance", weight: 20, detail: proposal.missionRelevance });
  if (factors.length === 0) factors.push({ id: "local_reversible", weight: 10, detail: "local reversible action" });
  return factors;
}

function calculateRiskScore(factors) {
  const score = factors.reduce((total, factor) => total + Number(factor.weight ?? 0), 0);
  return Math.max(0, Math.min(100, score));
}

function categorizeAction(actionType) {
  if (["credential_change", "oauth_scope_change"].includes(actionType)) return "credentials";
  if (["git_push", "deployment"].includes(actionType)) return "publishing";
  if (["external_send", "reputation_action"].includes(actionType)) return "communications";
  if (["financial_action"].includes(actionType)) return "financial";
  if (["legal_action"].includes(actionType)) return "legal";
  if (actionType.includes("delete") || actionType === "destructive_command") return "destructive";
  if (actionType === "command") return "local_command";
  return "general";
}

function buildAuthorityExplanation({ proposal, mission, matchedPolicies, riskFactors, summary }) {
  return {
    summary,
    evidence: {
      mission: mission
        ? {
            id: mission.id,
            goal: mission.goal,
            blockedActions: mission.blockedActions ?? [],
            allowedActions: mission.allowedActions ?? [],
          }
        : null,
      policies: matchedPolicies.map((policy) => ({
        id: policy.id,
        effect: policy.effect,
        severity: policy.severity,
        text: policy.text,
        source: policy.source,
      })),
      proposal: {
        actionType: proposal.actionType,
        target: proposal.target,
        externality: proposal.externality,
      },
      riskFactors,
    },
  };
}

function findMissionAuthorityOverride(mission = {}, proposal) {
  return (mission.authorityOverrides ?? []).find((override) => overrideMatches(override, proposal));
}

function overrideMatches(override, proposal) {
  const actionTypes = normalizeList(override.actionTypes, []);
  const targetIncludes = normalizeList(override.targetIncludes, []);
  const externalities = normalizeList(override.externalities, []);
  const actionMatches = actionTypes.length === 0 || actionTypes.includes(proposal.actionType);
  const target = String(proposal.target ?? "").toLowerCase();
  const targetMatches = targetIncludes.length === 0 || targetIncludes.some((item) => target.includes(String(item).toLowerCase()));
  const externalityMatches = externalities.length === 0 || externalities.includes(proposal.externality);
  return actionMatches && targetMatches && externalityMatches;
}

function structuredPolicyMatches(policy, proposal) {
  const actionTypes = policy.condition?.actionTypes ?? [];
  const targetIncludes = policy.condition?.targetIncludes ?? [];
  const externalities = policy.condition?.externalities ?? [];
  const actionMatches = actionTypes.length === 0 || actionTypes.includes(proposal.actionType);
  const target = String(proposal.target ?? "").toLowerCase();
  const targetMatches = targetIncludes.length === 0 || targetIncludes.some((item) => target.includes(String(item).toLowerCase()));
  const externalityMatches = externalities.length === 0 || externalities.includes(proposal.externality);
  return actionMatches && targetMatches && externalityMatches;
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

function classifyAlignment({ mission, activities }) {
  if (activities.length === 0) {
    return {
      state: "on_track",
      reason: "No concerning activity has been observed.",
      confidence: 0.55,
    };
  }

  const recentFailures = activities.filter((activity) => activity.type === "command" && Number(activity.exitCode) !== 0 && activity.exitCode !== undefined);
  if (recentFailures.length >= 3) {
    return {
      state: "stuck",
      reason: `${recentFailures.length} recent failing command(s) suggest the agent is looping or blocked.`,
      confidence: 0.86,
    };
  }

  const unsafe = activities.find((activity) => /\b(rm -rf|sudo|git push|deploy --prod|delete|credential|oauth|secret|token)\b/i.test(`${activity.summary} ${activity.target} ${activity.command}`));
  if (unsafe) {
    return {
      state: "unsafe",
      reason: `Observed potentially unsafe activity: ${unsafe.summary}`,
      confidence: 0.84,
    };
  }

  const drift = activities.find((activity) => activityLooksOutOfScope(activity, mission));
  if (drift) {
    return {
      state: "scope_drift",
      reason: `Observed work outside mission scope: ${drift.summary}`,
      confidence: 0.74,
    };
  }

  if (recentFailures.length > 0) {
    return {
      state: "needs_nudge",
      reason: `${recentFailures.length} recent failing command(s) need a course correction before more work continues.`,
      confidence: 0.68,
    };
  }

  return {
    state: "on_track",
    reason: "Recent activity matches the mission and no concerning pattern was detected.",
    confidence: 0.72,
  };
}

function buildAgentIntervention(report, evaluation, mission, now, interventionCount) {
  if (evaluation.state === "on_track") return null;
  const typeByState = {
    needs_nudge: "nudge",
    scope_drift: "nudge",
    stuck: "pause",
    unsafe: "queue",
  };
  const type = typeByState[evaluation.state] ?? "nudge";
  return {
    id: `intervention-${compactTimestamp(now)}-${interventionCount + 1}`,
    missionId: report.missionId,
    agentId: report.agentId,
    alignmentReportId: report.id,
    type,
    status: "active",
    message: buildInterventionMessage(type, evaluation, mission),
    createdAt: now,
  };
}

function buildInterventionMessage(type, evaluation, mission) {
  const goal = mission?.goal ?? "the current mission";
  if (type === "pause") return `Pause and reassess: ${evaluation.reason} Stay anchored to ${goal}.`;
  if (type === "queue") return `Queue for user review: ${evaluation.reason}`;
  return `Nudge: ${evaluation.reason} Refocus on ${goal}.`;
}

function activityLooksOutOfScope(activity, mission) {
  if (!mission?.goal) return false;
  const goalTerms = importantTerms(mission.goal);
  if (goalTerms.length === 0) return false;
  const activityText = `${activity.summary} ${activity.target} ${activity.command} ${(activity.fileChanges ?? []).join(" ")}`.toLowerCase();
  if (goalTerms.some((term) => activityText.includes(term))) return false;
  if (activity.type === "file_change" && /\b(marketing|homepage|landing|pricing|blog|social)\b/i.test(activityText)) return true;
  return false;
}

function importantTerms(text) {
  const stop = new Set(["the", "and", "for", "with", "this", "that", "while", "agent", "agents", "implement", "build", "fix", "improve", "run"]);
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !stop.has(term))
    .slice(0, 8);
}

function normalizeMemoryReviewStatus(status) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "pinned") return "pinned";
  throw new Error("memory review status must be approved, rejected, or pinned");
}

function normalizePolicyEffect(effect) {
  if (["allow", "queue", "pause", "deny", "rewrite"].includes(effect)) return effect;
  throw new Error("policy effect must be allow, queue, pause, deny, or rewrite");
}

function stemmedContains(text, term) {
  if (term.endsWith("s")) return text.includes(term.slice(0, -1));
  return text.includes(`${term}s`);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeMemoryText(text) {
  return String(text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function clipTranscript(text) {
  const value = String(text ?? "");
  return value.length > 4000 ? `${value.slice(0, 4000)}\n[truncated]` : value;
}

function oneLineText(value, maxLength = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
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
  if (/\b(prefer|always|working style|terminal-first|cli-first|focused|run tests|before completion|review before risky)\b/i.test(line)) {
    return "standing_preference";
  }
  if (/\b(github|repo|repository|commit|supervision|monitor|docs?|history)\b/i.test(line)) {
    return "project_context";
  }
  if (/\b(love|hate|interest|building|project|ambitious|agentic|infrastructure)\b/i.test(line)) {
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
