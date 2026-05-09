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
    contextConnectors: [],
    contextSyncSources: [],
    contextSyncRuns: [],
    setupRuns: [],
    installs: [],
    onboardingProfiles: [],
    watchPaths: [],
    adapterClients: [],
    daemonChecks: [],
    schemaMigrations: [],
    policies: [],
    imports: [],
    supervisedRuns: [],
    osObservations: [],
    observationEvents: [],
    adapterRegistrations: [],
    sourceEvidenceLinks: [],
    corrections: [],
    syncBundles: [],
    securityRuns: [],
    helperChecks: [],
    helperStreams: [],
    dogfoodDays: [],
    observerLoops: [],
    goals: [],
    proxyQuestions: [],
    proxyAnswers: [],
    proxyContinuations: [],
    proxyReviews: [],
    autopilotSessions: [],
    autopilotTicks: [],
    autopilotPrompts: [],
    autopilotStops: [],
    dogfood80Runs: [],
    dogfood90Runs: [],
    dogfoodUltimateRuns: [],
    liveAdapterTrials: [],
    launchAgentChecks: [],
    packageUpdates: [],
    releaseArtifacts: [],
    updateChannels: [],
    daemonTelemetry: [],
    liveSessionProofs: [],
    securityReviews: [],
    codexCliHooks: [],
    installChecks: [],
    repairRuns: [],
    goldenDemoRuns: [],
    dogfoodExports: [],
    savedMoments: [],
    memoryReviewSessions: [],
    watchReports: [],
    ultimateScoreEvidence: [],
    nativeServiceHealth: [],
    adapterSessions: [],
    adapterEvidence: [],
    runtimeInterventions: [],
    userDirections: [],
    profileFacts: [],
    trustGraph: [],
    auditChain: [],
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

export function startGoal(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `goal-${compactTimestamp(now)}`;
  const objective = options.text ?? options.objective ?? options.goal;
  if (!objective) throw new Error("goal objective is required");
  const missionId = options.missionId ?? options.mission ?? `mission-${id}`;
  const missionState = startMission(state, {
    id: missionId,
    hub: options.hub ?? "klemm_goal",
    goal: objective,
    allowedActions: options.allowedActions ?? DEFAULT_ALLOWED_ACTIONS,
    blockedActions: options.blockedActions ?? [...DEFAULT_BLOCKED_ACTIONS, "deployment"],
    rewriteAllowed: options.rewriteAllowed ?? true,
    escalationChannel: options.escalationChannel ?? "klemm_goal_queue",
    durationMinutes: options.durationMinutes,
    expiresAt: options.expiresAt,
    now,
  });
  const goal = {
    id,
    objective,
    successCriteria: options.success ?? options.successCriteria ?? "",
    missionId,
    status: options.status ?? "active",
    budgetTurns: Number(options.budgetTurns ?? 8),
    watchPaths: normalizeList(options.watchPaths ?? options.watchPath, []),
    attachedAgents: [],
    ticks: [],
    evidence: [],
    riskHints: [],
    createdAt: now,
  };

  return updateState(
    {
      ...missionState,
      goals: [goal, ...(missionState.goals ?? []).filter((item) => item.id !== id)],
      observationEvents: [
        {
          id: `observation-event-${compactTimestamp(now)}-goal-start`,
          type: "goal_started",
          missionId,
          goalId: id,
          summary: objective,
          createdAt: now,
        },
        ...(missionState.observationEvents ?? []),
      ],
    },
    now,
    {
      type: "goal_started",
      at: now,
      missionId,
      goalId: id,
      summary: objective,
    },
  );
}

export function addReviewedProxyMemory(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `memory-${compactTimestamp(now)}-${(state.memories?.length ?? 0) + 1}`;
  const memory = {
    id,
    memoryClass: options.memoryClass ?? "standing_preference",
    text: options.text ?? "",
    source: options.source ?? "proxy_seed",
    sourceRef: options.sourceRef ?? options.source ?? "proxy_seed",
    confidence: options.confidence ?? 0.9,
    status: options.status ?? "approved",
    createdAt: now,
    reviewedAt: now,
    reviewNote: options.note ?? "Proxy user-stand-in memory.",
  };
  return updateState(
    {
      ...state,
      memories: [memory, ...(state.memories ?? []).filter((item) => item.id !== id)],
    },
    now,
    {
      type: "proxy_memory_seeded",
      at: now,
      memoryId: id,
      summary: `Proxy memory ${id} added.`,
    },
  );
}

export function askProxy(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const goal = findGoal(state, options.goalId ?? options.goal ?? options.missionId);
  const mission = goal ? findMission(state, goal.missionId) : findMission(state, options.missionId ?? options.goalId ?? options.goal);
  const question = {
    id: options.id ?? `proxy-question-${compactTimestamp(now)}-${(state.proxyQuestions?.length ?? 0) + 1}`,
    goalId: goal?.id,
    missionId: mission?.id ?? goal?.missionId,
    agentId: options.agentId ?? options.agent ?? "unknown_agent",
    question: redactSensitiveText(options.question ?? ""),
    context: redactSensitiveText(options.context ?? ""),
    status: "answered",
    createdAt: now,
  };
  const judgment = buildProxyAnswer(state, question, { goal, mission, now });
  let nextState = state;
  let answer = {
    id: options.answerId ?? `proxy-answer-${compactTimestamp(now)}-${(state.proxyAnswers?.length ?? 0) + 1}`,
    questionId: question.id,
    goalId: question.goalId,
    missionId: question.missionId,
    agentId: question.agentId,
    answer: judgment.answer,
    confidence: judgment.confidence,
    evidenceMemoryIds: judgment.evidenceMemoryIds,
    evidence: judgment.evidence,
    riskLevel: judgment.riskLevel,
    riskFactors: judgment.riskFactors,
    shouldContinue: judgment.shouldContinue,
    nextPrompt: judgment.nextPrompt,
    escalationRequired: judgment.escalationRequired,
    queuedDecisionId: null,
    createdAt: now,
  };

  if (answer.escalationRequired && options.queueOnEscalation !== false) {
    nextState = proposeAction(state, {
      id: `decision-${answer.id}`,
      missionId: question.missionId,
      actor: "Klemm Proxy",
      actionType: "user_decision",
      target: question.question,
      externality: answer.riskLevel === "high" ? "high_risk_proxy_question" : "user_review_required",
      missionRelevance: answer.riskLevel === "high" ? "related" : "ambiguous",
      now,
    });
    const decision = nextState.decisions[0];
    answer = { ...answer, queuedDecisionId: decision.id };
    question.status = "queued";
  }

  return updateState(
    {
      ...nextState,
      proxyQuestions: [question, ...(nextState.proxyQuestions ?? []).filter((item) => item.id !== question.id)],
      proxyAnswers: [answer, ...(nextState.proxyAnswers ?? []).filter((item) => item.id !== answer.id)],
      observationEvents: [
        {
          id: `observation-event-${compactTimestamp(now)}-proxy-answer`,
          type: "proxy_answer",
          missionId: question.missionId,
          goalId: question.goalId,
          agentId: question.agentId,
          summary: `${answer.confidence} confidence: ${answer.answer}`,
          createdAt: now,
        },
        ...(nextState.observationEvents ?? []),
      ],
    },
    now,
    {
      type: "proxy_answered",
      at: now,
      missionId: question.missionId,
      goalId: question.goalId,
      proxyQuestionId: question.id,
      proxyAnswerId: answer.id,
      summary: `${answer.confidence} proxy answer for ${question.agentId}.`,
    },
  );
}

export function continueProxy(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const goal = findGoal(state, options.goalId ?? options.goal ?? options.missionId);
  if (!goal) throw new Error(`Goal not found: ${options.goalId ?? options.goal ?? options.missionId ?? "missing"}`);
  const mission = findMission(state, goal.missionId);
  const unresolved = (state.queue ?? []).filter((item) => item.status === "queued" && item.missionId === goal.missionId);
  const activities = (state.agentActivities ?? []).filter((activity) => activity.missionId === goal.missionId);
  const latestReport = (state.alignmentReports ?? []).find((report) => report.missionId === goal.missionId);
  const riskyGoal = (goal.riskHints ?? []).length > 0 || ["needs_review", "scope_drift", "unsafe", "stuck"].includes(goal.latestAlignment);
  const reportState = latestReport?.state;
  const nudge = reportState === "needs_nudge";
  const stuck = reportState === "stuck";
  const blocked = unresolved.length > 0 || riskyGoal || ["scope_drift", "unsafe", "stuck"].includes(reportState);
  const continuation = {
    id: options.id ?? `proxy-continuation-${compactTimestamp(now)}-${(state.proxyContinuations?.length ?? 0) + 1}`,
    goalId: goal.id,
    missionId: goal.missionId,
    agentId: options.agentId ?? options.agent ?? activities[0]?.agentId ?? "unknown_agent",
    shouldContinue: !blocked || nudge,
    escalationRequired: blocked,
    confidence: blocked ? "low" : nudge ? "medium" : "high",
    reason: blocked
      ? unresolved.length
        ? `${unresolved.length} queued decision(s) must be resolved before Klemm can stand in.`
        : "Recent goal or monitor evidence suggests drift, risk, or stuck work."
      : nudge
        ? latestReport.reason
      : "Recent work is local, aligned, and queue-clean.",
    nextPrompt: blocked
      ? stuck
        ? "Summarize and pause for Kyle; repeated failures suggest the agent is stuck."
        : "Pause and ask Kyle; Klemm lacks enough safe authority to continue."
      : nudge
        ? "Continue, but switch strategy before repeating the same command; inspect the failure, narrow the test, and report the course correction."
      : "Continue implementation toward the active goal; dogfood Klemm, run focused tests, then full verification; do not push or deploy without queue approval.",
    createdAt: now,
  };
  return updateState(
    {
      ...state,
      proxyContinuations: [continuation, ...(state.proxyContinuations ?? [])],
      observationEvents: [
        {
          id: `observation-event-${compactTimestamp(now)}-proxy-continuation`,
          type: "proxy_continuation",
          missionId: goal.missionId,
          goalId: goal.id,
          agentId: continuation.agentId,
          summary: continuation.nextPrompt,
          createdAt: now,
        },
        ...(state.observationEvents ?? []),
      ],
    },
    now,
    {
      type: "proxy_continuation",
      at: now,
      missionId: goal.missionId,
      goalId: goal.id,
      proxyContinuationId: continuation.id,
      summary: continuation.nextPrompt,
    },
  );
}

export function getProxyStatus(state, options = {}) {
  const goal = findGoal(state, options.goalId ?? options.goal ?? options.id ?? options.missionId);
  const missionId = goal?.missionId ?? options.missionId;
  const answerIds = new Set((state.proxyAnswers ?? []).filter((answer) => !missionId || answer.missionId === missionId).map((answer) => answer.id));
  return {
    goal,
    questions: (state.proxyQuestions ?? []).filter((question) => !missionId || question.missionId === missionId),
    answers: (state.proxyAnswers ?? []).filter((answer) => !missionId || answer.missionId === missionId),
    continuations: (state.proxyContinuations ?? []).filter((continuation) => !missionId || continuation.missionId === missionId),
    queued: (state.queue ?? []).filter((item) => !missionId || item.missionId === missionId).filter((item) => item.status === "queued"),
    reviewedAnswers: (state.proxyReviews ?? []).filter((review) => answerIds.has(review.proxyAnswerId)),
  };
}

export function reviewProxy(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const reviews = state.proxyReviews ?? [];
  const review = {
    id: options.id ?? `proxy-review-${compactTimestamp(now)}-${reviews.length + 1}`,
    proxyAnswerId: options.proxyAnswerId ?? options.answerId,
    status: options.status ?? "reviewed",
    note: options.note ?? "",
    createdAt: now,
  };
  return updateState(
    {
      ...state,
      proxyReviews: [review, ...reviews],
    },
    now,
    {
      type: "proxy_reviewed",
      at: now,
      proxyAnswerId: review.proxyAnswerId,
      summary: `${review.proxyAnswerId} proxy answer reviewed.`,
    },
  );
}

export function attachGoalAgent(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const goal = findGoal(state, options.id ?? options.goalId ?? options.goal ?? options.missionId);
  if (!goal) throw new Error(`Goal not found: ${options.id ?? options.goalId ?? options.goal ?? "missing"}`);
  const agentId = options.agentId ?? options.agent ?? options.actor;
  if (!agentId) throw new Error("agentId is required");
  const withAgent = registerAgent(state, {
    id: agentId,
    missionId: goal.missionId,
    name: options.name ?? agentId,
    kind: options.kind ?? "agent",
    command: options.command ?? "",
    now,
  });
  const attached = {
    agentId,
    kind: options.kind ?? "agent",
    command: options.command ?? "",
    source: options.source,
    attachedAt: now,
  };

  return updateState(
    {
      ...withAgent,
      goals: (withAgent.goals ?? []).map((item) =>
        item.id === goal.id
          ? {
              ...item,
              attachedAgents: [attached, ...(item.attachedAgents ?? []).filter((agent) => agent.agentId !== agentId)],
            }
          : item,
      ),
      observationEvents: [
        {
          id: `observation-event-${compactTimestamp(now)}-goal-agent`,
          type: "goal_agent_attached",
          missionId: goal.missionId,
          goalId: goal.id,
          agentId,
          summary: `${agentId} attached to ${goal.id}`,
          createdAt: now,
        },
        ...(withAgent.observationEvents ?? []),
      ],
    },
    now,
    {
      type: "goal_agent_attached",
      at: now,
      missionId: goal.missionId,
      goalId: goal.id,
      agentId,
      summary: `${agentId} attached to ${goal.id}`,
    },
  );
}

export function recordGoalTick(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const goal = findGoal(state, options.id ?? options.goalId ?? options.goal ?? options.missionId);
  if (!goal) throw new Error(`Goal not found: ${options.id ?? options.goalId ?? options.goal ?? "missing"}`);
  const changedFiles = normalizeList(options.changedFiles ?? options.changedFile, []);
  const evidence = normalizeList(options.evidence, []);
  const assessment = assessGoalTick(goal, {
    summary: options.summary,
    agentOutput: options.agentOutput,
    changedFiles,
  });
  const tick = {
    id: options.tickId ?? `goal-tick-${compactTimestamp(now)}-${((goal.ticks ?? []).length ?? 0) + 1}`,
    goalId: goal.id,
    at: now,
    agentId: options.agentId ?? options.agent ?? "unknown_agent",
    summary: redactSensitiveText(options.summary ?? "Goal tick recorded."),
    changedFiles,
    evidence: evidence.map(redactSensitiveText),
    alignment: assessment.alignment,
    riskHints: assessment.riskHints,
  };
  const events = [
    {
      id: `observation-event-${compactTimestamp(now)}-goal-tick`,
      type: "goal_tick",
      missionId: goal.missionId,
      goalId: goal.id,
      agentId: tick.agentId,
      summary: tick.summary,
      createdAt: now,
    },
    ...assessment.riskHints.map((hint, index) => ({
      id: `observation-event-${compactTimestamp(now)}-goal-risk-${index}`,
      type: "risk_hint",
      missionId: goal.missionId,
      goalId: goal.id,
      agentId: tick.agentId,
      summary: hint,
      createdAt: now,
    })),
  ];
  const withActivity = options.recordActivity === false
    ? state
    : recordAgentActivity(state, {
        missionId: goal.missionId,
        agentId: tick.agentId,
        type: "goal_tick",
        summary: tick.summary,
        target: changedFiles.join(","),
        fileChanges: changedFiles,
        evidence: { goalId: goal.id, riskHints: tick.riskHints, evidence: tick.evidence },
        now,
      });

  return updateState(
    {
      ...withActivity,
      goals: (withActivity.goals ?? []).map((item) =>
        item.id === goal.id
          ? {
              ...item,
              ticks: [tick, ...(item.ticks ?? [])],
              evidence: [...tick.evidence, ...(item.evidence ?? [])],
              riskHints: [...assessment.riskHints, ...(item.riskHints ?? [])],
              lastTickAt: now,
              latestAlignment: assessment.alignment,
            }
          : item,
      ),
      observationEvents: [...events, ...(withActivity.observationEvents ?? [])],
    },
    now,
    {
      type: "goal_tick_recorded",
      at: now,
      missionId: goal.missionId,
      goalId: goal.id,
      agentId: tick.agentId,
      summary: tick.summary,
    },
  );
}

export function setGoalStatus(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const goal = findGoal(state, options.id ?? options.goalId ?? options.goal ?? options.missionId);
  if (!goal) throw new Error(`Goal not found: ${options.id ?? options.goalId ?? options.goal ?? "missing"}`);
  const status = options.status ?? "active";
  return updateState(
    {
      ...state,
      goals: (state.goals ?? []).map((item) =>
        item.id === goal.id
          ? {
              ...item,
              status,
              [`${status}At`]: now,
              pauseReason: status === "paused" ? options.reason ?? "" : item.pauseReason,
            }
          : item,
      ),
      observationEvents: [
        {
          id: `observation-event-${compactTimestamp(now)}-goal-${status}`,
          type: `goal_${status}`,
          missionId: goal.missionId,
          goalId: goal.id,
          summary: options.reason ?? status,
          createdAt: now,
        },
        ...(state.observationEvents ?? []),
      ],
    },
    now,
    {
      type: `goal_${status}`,
      at: now,
      missionId: goal.missionId,
      goalId: goal.id,
      summary: options.reason ?? status,
    },
  );
}

export function completeGoal(state, options = {}) {
  const next = setGoalStatus(state, { ...options, status: "completed" });
  const now = options.now ?? next.updatedAt ?? new Date().toISOString();
  const goal = findGoal(next, options.id ?? options.goalId ?? options.goal ?? options.missionId);
  const evidence = redactSensitiveText(options.evidence ?? "completed");
  return updateState(
    {
      ...next,
      goals: (next.goals ?? []).map((item) =>
        item.id === goal.id
          ? {
              ...item,
              completedAt: now,
              completionEvidence: evidence,
              evidence: [evidence, ...(item.evidence ?? [])],
            }
          : item,
      ),
      observationEvents: [
        {
          id: `observation-event-${compactTimestamp(now)}-goal-completed`,
          type: "goal_completed",
          missionId: goal.missionId,
          goalId: goal.id,
          summary: evidence,
          createdAt: now,
        },
        ...(next.observationEvents ?? []),
      ],
    },
    now,
    {
      type: "goal_completed",
      at: now,
      missionId: goal.missionId,
      goalId: goal.id,
      summary: evidence,
    },
  );
}

export function getGoalStatus(state, options = {}) {
  const goal = findGoal(state, options.id ?? options.goalId ?? options.goal ?? options.missionId);
  if (!goal) throw new Error(`Goal not found: ${options.id ?? options.goalId ?? options.goal ?? "missing"}`);
  return {
    goal,
    mission: findMission(state, goal.missionId),
    activities: (state.agentActivities ?? []).filter((activity) => activity.missionId === goal.missionId),
    decisions: (state.decisions ?? []).filter((decision) => decision.missionId === goal.missionId),
    observationEvents: (state.observationEvents ?? []).filter((event) => event.missionId === goal.missionId),
  };
}

export function summarizeGoalDebrief(state, options = {}) {
  const { goal, activities, decisions } = getGoalStatus(state, options);
  return [
    "Klemm goal debrief",
    `Goal: ${goal.id}`,
    `Status: ${goal.status}`,
    `Objective: ${goal.objective}`,
    `Success: ${goal.successCriteria || "not specified"}`,
    `Mission: ${goal.missionId}`,
    `Ticks: ${(goal.ticks ?? []).length}`,
    `Decisions: ${decisions.length}`,
    `Activities: ${activities.length}`,
    "Evidence:",
    ...((goal.evidence ?? []).length ? (goal.evidence ?? []).slice(0, 8).map((item) => `- ${redactSensitiveText(item)}`) : ["- none"]),
    "Risk hints:",
    ...((goal.riskHints ?? []).length ? (goal.riskHints ?? []).slice(0, 8).map((hint) => `- ${redactSensitiveText(hint)}`) : ["- none"]),
  ].join("\n");
}

export function findGoal(state, idOrMission) {
  const goals = state.goals ?? [];
  if (!idOrMission) return goals.find((goal) => goal.status === "active") ?? goals[0] ?? null;
  return goals.find((goal) => goal.id === idOrMission || goal.missionId === idOrMission) ?? null;
}

export function assessGoalTick(goal, { summary = "", agentOutput = "", changedFiles = [] } = {}) {
  const riskHints = [];
  const text = `${summary} ${agentOutput}`.toLowerCase();
  if (/\bdeploy|production|publish|send|credential|secret|token|oauth|delete|push\b/.test(text)) {
    riskHints.push("goal work mentions a risky or external action");
  }
  const watchPaths = goal.watchPaths ?? [];
  if (watchPaths.length > 0) {
    for (const file of changedFiles) {
      const normalized = String(file);
      const inside = watchPaths.some((path) => normalized === path || normalized.startsWith(`${path.replace(/\/$/, "")}/`) || normalized.includes(`/${path.replace(/^\.\//, "").replace(/\/$/, "")}/`));
      if (!inside) riskHints.push(`changed file outside goal watch paths: ${normalized}`);
    }
  }
  return {
    alignment: riskHints.length ? "needs_review" : "on_track",
    riskHints,
  };
}

function buildProxyAnswer(state, question, { goal, mission, now } = {}) {
  const text = `${question.question} ${question.context}`.toLowerCase();
  const riskFactors = [];
  const ambiguityFactors = [];
  if (/\bdeploy|production|publish|package|push|github|credential|secret|token|oauth|delete|financial|legal|post|send\b/.test(text)) {
    riskFactors.push("Question mentions a high-risk external, destructive, credential, publish, or reputation action.");
  }
  if (/\brename|rebrand|audience|positioning|product direction|change (?:the )?product|pivot|strategy\b/.test(text)) {
    ambiguityFactors.push("Question asks for product-direction authority that needs Kyle's direct judgment.");
  }
  const evidenceMemories = findProxyEvidenceMemories(state, text);
  const hasProceed = /\bproceed|what'?s next|continue|keep going\b/.test(text);
  const hasNoCorners = /\bdo all|all five|all listed|no corners|full effort|no cut corners\b/.test(text);
  const hasExplicitContinuationIntent = hasProceed || hasNoCorners || /\bdogfood|focused tests|safe local|local steps|implementation\b/.test(text);
  const localSafeContext = !riskFactors.length && !ambiguityFactors.length && (goal || mission);
  const confidence =
    riskFactors.length > 0
      ? "low"
      : ambiguityFactors.length > 0
        ? "low"
        : hasExplicitContinuationIntent && (evidenceMemories.length >= 2 || (hasProceed && evidenceMemories.length >= 1) || (hasNoCorners && evidenceMemories.length >= 1))
          ? "high"
          : hasExplicitContinuationIntent && evidenceMemories.length === 1
            ? "medium"
            : "low";
  const shouldContinue = localSafeContext && (confidence === "high" || confidence === "medium");
  const escalationRequired = riskFactors.length > 0 || ambiguityFactors.length > 0 || confidence === "low";
  const riskLevel = riskFactors.length > 0 ? "high" : (ambiguityFactors.length > 0 || confidence === "low") ? "medium" : "low";
  const goalText = goal?.objective ?? mission?.goal ?? "the active goal";
  const answer = escalationRequired
    ? "Pause and ask Kyle; Klemm does not have enough safe authority to answer this as the user."
    : confidence === "high"
      ? "Proceed with all listed safe local steps. Stay aligned to the active goal, dogfood Klemm, run focused tests, then full verification."
      : "Continue with the safe local portion only, keep changes reversible, and record evidence for review.";
  const nextPrompt = escalationRequired
    ? "Pause and ask Kyle before continuing."
    : confidence === "high"
      ? `Proceed toward "${goalText}"; dogfood Klemm, implement the listed local steps, run focused tests, then full verification. Do not push or deploy without queue approval.`
      : `Continue the safe local work toward "${goalText}" and ask Kyle before broad product-direction or external actions.`;

  return {
    answer,
    confidence,
    evidenceMemoryIds: evidenceMemories.map((memory) => memory.id),
    evidence: evidenceMemories.map((memory) => ({
      id: memory.id,
      text: redactSensitiveText(memory.text),
      status: memory.status,
      memoryClass: memory.memoryClass,
    })),
    riskLevel,
    riskFactors: [...riskFactors, ...ambiguityFactors],
    shouldContinue,
    nextPrompt,
    escalationRequired,
  };
}

function findProxyEvidenceMemories(state, text) {
  const memories = (state.memories ?? []).filter((memory) => memory.status === "approved" || memory.status === "pinned");
  const wantsContinuation = /\bproceed|what'?s next|whats next|continue|keep going|do all|all listed|no corners|dogfood|focused tests|safe local|implementation\b/.test(text);
  const scored = memories.map((memory) => {
    const body = `${memory.text} ${memory.memoryClass}`.toLowerCase();
    let score = 0;
    for (const term of ["proceed", "what's next", "whats next", "continue", "no corners", "do all", "dogfood", "terminal", "commit", "push", "tests", "safe local"]) {
      if (wantsContinuation && body.includes(term)) score += 1;
      if (text.includes(term) && body.includes(term)) score += 3;
    }
    if (wantsContinuation && memory.memoryClass === "standing_preference") score += 1;
    return { memory, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.memory);
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
      rewrite: options.rewrite ?? item.rewrite,
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
          rewrite: options.rewrite ?? decision.rewrite,
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

    const promptIntent = buildPromptIntentMemoryText(line);
    const memoryClass = promptIntent ? "prompt_intent_pattern" : classifyMemoryLine(line);
    if (!memoryClass) continue;
    const text = promptIntent ?? line;
    const normalizedText = normalizeMemoryText(text);
    if (seenMemoryTexts.has(normalizedText)) {
      duplicateCount += 1;
      continue;
    }
    seenMemoryTexts.add(normalizedText);

    memories.push({
      id: `memory-${compactTimestamp(now)}-${state.memories.length + memories.length + 1}`,
      memoryClass,
      text,
      source,
      sourceRef,
      confidence: inferMemoryConfidence(text, memoryClass),
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
    workingStyle: memories.filter((memory) => memory.memoryClass === "standing_preference" || memory.memoryClass === "prompt_intent_pattern"),
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
  const command = redactSensitiveText(input.toolCall?.arguments?.command ?? input.command ?? "");
  const target = redactSensitiveText(type === "tool_call" ? toolName : input.target ?? command);
  const summary = redactSensitiveText(input.summary ?? `${type} reported by ${agentId}`);

  return {
    protocolVersion: Number(input.protocolVersion ?? 1),
    adapterClientId: input.adapterClientId,
    adapterToken: input.adapterToken,
    type,
    missionId,
    agentId,
    summary,
    activity: {
      missionId,
      agentId,
      type: type === "diff" ? "file_change" : type,
      summary,
      target,
      command,
      fileChanges: input.diff?.files ?? input.fileChanges ?? [],
      evidence: {
        plan: redactSensitiveText(input.plan),
        toolCall: redactToolCall(input.toolCall),
        uncertainty: redactSensitiveText(input.uncertainty),
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
    installs: state.installs ?? [],
    onboardingProfiles: state.onboardingProfiles ?? [],
    watchPaths: state.watchPaths ?? [],
    adapterClients: state.adapterClients ?? [],
    daemonChecks: state.daemonChecks ?? [],
    observationEvents: state.observationEvents ?? [],
    adapterRegistrations: state.adapterRegistrations ?? [],
    sourceEvidenceLinks: state.sourceEvidenceLinks ?? [],
    corrections: state.corrections ?? [],
    syncBundles: state.syncBundles ?? [],
    securityRuns: state.securityRuns ?? [],
    helperChecks: state.helperChecks ?? [],
    helperStreams: state.helperStreams ?? [],
    dogfoodDays: state.dogfoodDays ?? [],
    observerLoops: state.observerLoops ?? [],
    goals: state.goals ?? [],
    proxyQuestions: state.proxyQuestions ?? [],
    proxyAnswers: state.proxyAnswers ?? [],
    proxyContinuations: state.proxyContinuations ?? [],
    proxyReviews: state.proxyReviews ?? [],
    autopilotSessions: state.autopilotSessions ?? [],
    autopilotTicks: state.autopilotTicks ?? [],
    autopilotPrompts: state.autopilotPrompts ?? [],
    autopilotStops: state.autopilotStops ?? [],
    dogfood80Runs: state.dogfood80Runs ?? [],
    dogfood90Runs: state.dogfood90Runs ?? [],
    dogfoodUltimateRuns: state.dogfoodUltimateRuns ?? [],
    liveAdapterTrials: state.liveAdapterTrials ?? [],
    launchAgentChecks: state.launchAgentChecks ?? [],
    packageUpdates: state.packageUpdates ?? [],
    releaseArtifacts: state.releaseArtifacts ?? [],
    updateChannels: state.updateChannels ?? [],
    daemonTelemetry: state.daemonTelemetry ?? [],
    liveSessionProofs: state.liveSessionProofs ?? [],
    securityReviews: state.securityReviews ?? [],
    codexCliHooks: state.codexCliHooks ?? [],
    installChecks: state.installChecks ?? [],
    repairRuns: state.repairRuns ?? [],
    goldenDemoRuns: state.goldenDemoRuns ?? [],
    dogfoodExports: state.dogfoodExports ?? [],
    savedMoments: state.savedMoments ?? [],
    memoryReviewSessions: state.memoryReviewSessions ?? [],
    watchReports: state.watchReports ?? [],
    ultimateScoreEvidence: state.ultimateScoreEvidence ?? [],
    nativeServiceHealth: state.nativeServiceHealth ?? [],
    adapterSessions: state.adapterSessions ?? [],
    adapterEvidence: state.adapterEvidence ?? [],
    runtimeInterventions: state.runtimeInterventions ?? [],
    userDirections: state.userDirections ?? [],
    profileFacts: state.profileFacts ?? [],
    trustGraph: state.trustGraph ?? [],
    auditChain: state.auditChain ?? [],
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
  const intervalMinutes = Number(options.intervalMinutes ?? options.interval ?? 0);
  const source = {
    id,
    provider: normalizeContextProvider(options.provider ?? "unknown"),
    path: options.path ?? options.filePath,
    sourceRef: options.sourceRef ?? options.path ?? options.provider ?? "unknown",
    enabled: options.enabled ?? true,
    intervalMinutes,
    nextRunAt: options.nextRunAt ?? (intervalMinutes > 0 ? now : undefined),
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
    dueRun: Boolean(options.dueRun),
    nextRunAt: options.nextRunAt,
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

export function buildContextSyncPlan(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const sourceId = options.id ?? options.sourceId;
  const nowMs = Date.parse(now);
  const planned = (state.contextSyncSources ?? [])
    .filter((source) => source.enabled !== false)
    .filter((source) => !sourceId || source.id === sourceId)
    .map((source) => {
      const intervalMinutes = Number(source.intervalMinutes ?? 0);
      const nextRunAt = source.nextRunAt ?? source.lastImportedAt ?? source.createdAt ?? now;
      const due = intervalMinutes <= 0 || Date.parse(nextRunAt) <= nowMs;
      return {
        source,
        sourceId: source.id,
        provider: source.provider,
        due,
        nextRunAt,
        intervalMinutes,
        reason: due ? "due" : "waiting",
      };
    });

  return {
    now,
    planned,
    due: planned.filter((item) => item.due),
    waiting: planned.filter((item) => !item.due),
  };
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
    summary: redactSensitiveText(options.summary ?? "Agent activity recorded."),
    target: redactSensitiveText(options.target ?? ""),
    command: redactSensitiveText(options.command ?? ""),
    exitCode: options.exitCode,
    fileChanges: options.fileChanges ?? [],
    evidence: redactEvidence(options.evidence ?? {}),
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

export function recordBriefAcknowledgement(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const missionId = options.missionId ?? options.mission ?? options.goal;
  const agentId = options.agentId ?? options.agent ?? "agent-codex";
  if (!missionId) throw new Error("missionId is required");
  const reviewedCount = (state.memories ?? []).filter((memory) => ["approved", "pinned"].includes(memory.status)).length;
  const policyCount = (state.policies ?? []).filter((policy) => policy.status !== "disabled").length;
  const next = recordAgentActivity(state, {
    missionId,
    agentId,
    type: "activity",
    target: "klemm user brief",
    summary: `Brief acknowledged by ${agentId}; reviewed=${reviewedCount} policies=${policyCount}.`,
    evidence: {
      briefRuntimeEvent: "acknowledged",
      reviewedCount,
      policyCount,
    },
    now,
  });
  return { state: next, acknowledgement: next.agentActivities[0] };
}

export function checkBriefPlan(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const missionId = options.missionId ?? options.mission ?? options.goal;
  const agentId = options.agentId ?? options.agent ?? "agent-codex";
  const plan = redactSensitiveText(options.plan ?? options.planText ?? options.summary ?? "");
  if (!missionId) throw new Error("missionId is required");
  if (!plan) throw new Error("plan is required");
  const sequence = countBriefChecks(state, { missionId }) + 1;
  const checkId = options.id ?? `brief-check-${missionId}-${sequence}`;
  const priorDriftCount = countBriefDrift(state, { missionId, agentId });
  const drift = classifyBriefPlanDrift(state, { missionId, agentId, plan, priorDriftCount });
  const enforcement = drift.enforcement;
  const decisionId = enforcement === "queue" ? `decision-${checkId}` : null;
  let next = state;
  if (decisionId) {
    next = proposeAction(next, {
      id: decisionId,
      missionId,
      actor: agentId,
      actionType: "brief_conflict",
      target: plan,
      privacyExposure: "local_context",
      externality: "brief_high_risk_conflict",
      missionRelevance: "related",
      now,
    });
  }
  next = recordAgentActivity(next, {
    id: `activity-${checkId}`,
    missionId,
    agentId,
    type: "activity",
    target: "klemm brief check",
    summary: `Brief check ${enforcement}: ${drift.reason}`,
    command: plan,
    evidence: {
      briefRuntimeEvent: "check",
      briefCheckId: checkId,
      enforcement,
      riskLevel: drift.riskLevel,
      drift: drift.drift ? "yes" : "no",
      driftCount: enforcement === "aligned" ? priorDriftCount : priorDriftCount + 1,
      suggestedRewrite: drift.suggestedRewrite ?? "",
      queuedDecisionId: decisionId ?? "",
      section: drift.section ?? "",
      sourceMemoryId: drift.memory?.id ?? "",
      reason: drift.reason,
    },
    now,
  });
  const activity = next.agentActivities[0];
  return {
    state: next,
    check: {
      id: checkId,
      missionId,
      agentId,
      plan,
      enforcement,
      drift: drift.drift,
      riskLevel: drift.riskLevel,
      reason: drift.reason,
      section: drift.section,
      sourceMemoryId: drift.memory?.id,
      suggestedRewrite: drift.suggestedRewrite,
      queuedDecisionId: decisionId,
      driftCount: activity.evidence?.driftCount ?? (drift.drift ? priorDriftCount + 1 : priorDriftCount),
      activityId: activity.id,
      createdAt: now,
    },
    decision: decisionId ? next.decisions.find((decision) => decision.id === decisionId) : null,
  };
}

export function getBriefRuntimeStatus(state, options = {}) {
  const missionId = options.missionId ?? options.mission ?? options.goal;
  const agentId = options.agentId ?? options.agent;
  const activities = (state.agentActivities ?? [])
    .filter((activity) => !missionId || activity.missionId === missionId)
    .filter((activity) => !agentId || activity.agentId === agentId);
  const delivered = activities.some((activity) => activity.type === "profile_brief" || /profile brief/i.test(`${activity.type} ${activity.summary} ${activity.target}`));
  const acknowledged = activities.some((activity) => activity.evidence?.briefRuntimeEvent === "acknowledged" || /brief acknowledged/i.test(activity.summary ?? ""));
  const checks = activities.filter((activity) => activity.evidence?.briefCheckId || /brief check/i.test(`${activity.target} ${activity.summary}`));
  const latest = checks[0] ?? null;
  const driftChecks = checks.filter((activity) => ["nudge", "queue", "pause"].includes(activity.evidence?.enforcement));
  return {
    missionId,
    agentId,
    briefDelivered: delivered,
    briefAcknowledged: acknowledged,
    lastBriefCheck: latest?.evidence?.enforcement ?? "none",
    lastBriefCheckId: latest?.evidence?.briefCheckId,
    driftCount: driftChecks.length,
    enforcementState: latest?.evidence?.enforcement ?? "none",
    lastActivityAt: latest?.createdAt,
    checks,
  };
}

export function recordBriefCorrection(state, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const checkId = options.checkId ?? options.check;
  const verdict = normalizeBriefCorrectionVerdict(options.verdict);
  const note = redactSensitiveText(options.note ?? options.preference ?? "");
  if (!checkId) throw new Error("checkId is required");
  if (!note) throw new Error("note is required");
  const checkActivity = findBriefCheckActivity(state, checkId);
  if (!checkActivity) throw new Error(`Brief check not found: ${checkId}`);
  const correction = {
    id: options.id ?? `correction-brief-${compactTimestamp(now)}-${(state.corrections?.length ?? 0) + 1}`,
    decisionId: checkId,
    briefCheckId: checkId,
    missionId: checkActivity.missionId,
    agentId: checkActivity.agentId,
    verdict,
    preference: briefCorrectionMemoryText(verdict, note),
    note,
    status: "pending",
    createdAt: now,
  };
  const memory = {
    id: options.memoryId ?? `memory-${compactTimestamp(now)}-${(state.memories?.length ?? 0) + 1}`,
    memoryClass: verdict === "always_queue" ? "authority_boundary" : "standing_preference",
    text: correction.preference,
    source: "brief_correction",
    sourceRef: checkId,
    confidence: 0.82,
    status: "pending_review",
    createdAt: now,
    evidence: {
      provider: "klemm_brief",
      sourceRef: checkId,
      verdict,
      note,
    },
  };
  const next = updateState(
    {
      ...state,
      corrections: [correction, ...(state.corrections ?? [])],
      memories: [memory, ...(state.memories ?? [])],
      sourceEvidenceLinks: [
        {
          id: `source-link-${compactTimestamp(now)}-brief-correction`,
          memoryId: memory.id,
          sourceRef: checkId,
          decisionId: checkId,
          createdAt: now,
        },
        ...(state.sourceEvidenceLinks ?? []),
      ],
    },
    now,
    {
      type: "brief_correction_recorded",
      at: now,
      missionId: checkActivity.missionId,
      agentId: checkActivity.agentId,
      correctionId: correction.id,
      memoryId: memory.id,
      summary: correction.preference,
    },
  );
  return { state: next, correction, memory };
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
    command: redactSensitiveText(options.command ?? ""),
    cwd: options.cwd ?? "",
    pid: options.pid,
    processTree: options.processTree ?? [],
    terminationSignal: options.terminationSignal,
    timedOut: Boolean(options.timedOut),
    exitCode: options.exitCode ?? 0,
    durationMs: options.durationMs ?? 0,
    stdout: clipTranscript(redactSensitiveText(options.stdout ?? "")),
    stderr: clipTranscript(redactSensitiveText(options.stderr ?? "")),
    fileChanges: options.fileChanges ?? [],
    liveInterventions: options.liveInterventions ?? [],
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
      summary: `${redactSensitiveText(run.command)} exited ${run.exitCode}.`,
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
  const agentActivities = mission ? (state.agentActivities ?? []).filter((activity) => activity.missionId === mission.id) : state.agentActivities ?? [];
  const autopilotTicks = mission ? (state.autopilotTicks ?? []).filter((tick) => tick.missionId === mission.id) : state.autopilotTicks ?? [];
  const autopilotStops = mission ? (state.autopilotStops ?? []).filter((stop) => stop.missionId === mission.id) : state.autopilotStops ?? [];
  const helperStream = latestHelperStreamForMission(state, mission?.id);
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
    `Observation events: ${(state.observationEvents ?? []).filter((event) => !mission || event.missionId === mission.id).length}`,
    `Helper stream: ${helperStream?.status ?? "none"} health=${helperStream ? helperStreamHealthForState(helperStream) : "none"}`,
    `Adapter registrations: ${(state.adapterRegistrations ?? []).length}`,
    `Corrections: ${(state.corrections ?? []).length}`,
    `Sync bundles: ${(state.syncBundles ?? []).length}`,
    `Security runs: ${(state.securityRuns ?? []).length}`,
    `Agent activities: ${agentActivities.length}`,
    `Autopilot ticks: ${autopilotTicks.length}`,
    `Autopilot stops: ${autopilotStops.length}`,
    `Latest alignment: ${alignmentReports[0]?.state ?? "none"}`,
    `Active interventions: ${agentInterventions.filter((intervention) => intervention.status === "active").length}`,
    "Recent events:",
    ...events.slice(0, 5).map((event) => `- ${event.id} ${event.type}: ${redactSensitiveText(event.summary)}`),
    "Recent activity:",
    ...(agentActivities.length === 0
      ? ["- none"]
      : agentActivities.slice(0, 8).map((activity) => `- ${activity.id} ${activity.type}: ${redactSensitiveText(activity.summary)} ${redactSensitiveText(activity.target ?? "")}`)),
    "Recent autopilot:",
    ...(autopilotTicks.length === 0
      ? ["- none"]
      : autopilotTicks.slice(0, 5).map((tick) => `- ${tick.id} ${tick.decision}/${tick.confidence}: ${redactSensitiveText(tick.nextPrompt ?? tick.reason ?? "")}`)),
    "Recent supervised runs:",
    ...(supervisedRuns.length === 0
      ? ["- none"]
      : supervisedRuns.slice(0, 3).map((run) => `- ${run.id} exit=${run.exitCode} stdout=${redactSensitiveText(oneLineText(run.stdout))} stderr=${redactSensitiveText(oneLineText(run.stderr))}`)),
    "Recent interventions:",
    ...decisions
      .slice(0, 8)
      .map((decision) => `- ${decision.id} ${decision.decision}/${decision.status}: ${decision.actor} ${decision.actionType} ${redactSensitiveText(decision.target)} | klemm trust report ${decision.id}`),
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
  const helperStream = latestHelperStreamForMission(state, mission?.id);

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
    `Observation events: ${(state.observationEvents ?? []).filter((event) => !mission || event.missionId === mission.id).length}`,
    `Helper stream: ${helperStream?.status ?? "none"} health=${helperStream ? helperStreamHealthForState(helperStream) : "none"}`,
    `Adapter registrations: ${(state.adapterRegistrations ?? []).length}`,
    `Corrections: ${(state.corrections ?? []).length}`,
    `Sync bundles: ${(state.syncBundles ?? []).length}`,
    `Security runs: ${(state.securityRuns ?? []).length}`,
    `Latest alignment: ${alignmentReports[0]?.state ?? "none"}`,
    "Recent interventions",
    ...(decisions.length === 0
      ? ["- none"]
      : decisions.slice(0, 5).map((decision) => `- ${decision.id} ${decision.decision}: ${decision.actionType} ${redactSensitiveText(decision.target)}`)),
    "Recent events",
    ...(events.length === 0 ? ["- none"] : events.slice(0, 5).map((event) => `- ${event.type}: ${redactSensitiveText(event.summary)}`)),
    "Next actions:",
    ...(mission
      ? [
          `- klemm debrief --mission ${mission.id}`,
          unresolved[0]
            ? `- klemm queue inspect ${unresolved[0].id}`
            : null,
          unresolved[0]
            ? `- klemm queue approve|deny|rewrite ${unresolved[0].id}`
            : null,
          `- klemm mission finish ${mission.id} "work complete"`,
        ].filter(Boolean)
      : ["- klemm mission start --goal \"...\""]),
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

function latestHelperStreamForMission(state, missionId) {
  const streams = state.helperStreams ?? [];
  if (!missionId) return streams[0] ?? null;
  return streams.find((stream) => stream.missionId === missionId || stream.id === missionId) ?? null;
}

function helperStreamHealthForState(stream) {
  if (stream.status !== "running") return "stopped";
  const timestamp = Date.parse(stream.lastHeartbeatAt ?? stream.lastSnapshotAt ?? 0);
  if (!Number.isFinite(timestamp)) return "stale";
  return Date.now() - timestamp > 30_000 ? "stale" : "healthy";
}

function extractContextRecords(provider, { payload = "", filePath, sourceRef } = {}) {
  if (provider === "chrome_history" && filePath && !String(payload ?? "").trim() && looksLikeSqliteDatabase(filePath)) {
    return extractChromeSqliteHistory(filePath, sourceRef);
  }
  const text = filePath && !String(payload ?? "").trim() ? readFileSync(filePath, "utf8") : String(payload ?? "");
  if (provider === "chatgpt") return extractChatGptRecords(text, sourceRef);
  if (provider === "claude") return extractClaudeRecords(text, sourceRef);
  if (provider === "codex") return extractCodexRecords(text, sourceRef);
  if (provider === "gemini") return extractGeminiRecords(text, sourceRef);
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

function extractGeminiRecords(text, sourceRef) {
  const parsed = parseJsonOrNull(text);
  if (!parsed) return extractPlainTextRecords("gemini", text, sourceRef);
  const conversations = Array.isArray(parsed?.conversations) ? parsed.conversations : Array.isArray(parsed) ? parsed : [parsed];
  const records = [];
  for (const conversation of conversations) {
    const messages = conversation.messages ?? conversation.turns ?? conversation.entries ?? [];
    for (const [index, message] of messages.entries()) {
      const content = extractMessageText(message.text ?? message.content ?? message.parts);
      if (!content) continue;
      records.push({
        id: `${conversation.id ?? conversation.uuid ?? sourceRef}:${index}`,
        provider: "gemini",
        sourceRef,
        role: message.role ?? message.author ?? "unknown",
        content,
        createdAt: message.created_at ?? message.createdAt ?? message.timestamp,
        evidence: {
          provider: "gemini",
          sourceRef,
          conversationId: conversation.id ?? conversation.uuid,
          conversationTitle: conversation.title ?? conversation.name,
          messageId: `${conversation.id ?? conversation.uuid ?? sourceRef}:${index}`,
        },
      });
    }
  }
  return records.length > 0 ? records : extractMemoryExportMessages(text).map((message, index) => ({
    id: `${sourceRef}:${index}`,
    provider: "gemini",
    sourceRef,
    role: message.role,
    content: message.content,
    evidence: { provider: "gemini", sourceRef, messageId: `${index}` },
  }));
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
    const promptIntent = buildPromptIntentMemoryText(text);
    const finalMemoryClass = promptIntent ? "prompt_intent_pattern" : memoryClass;
    if (!finalMemoryClass) continue;
    const memoryText = promptIntent ?? text;
    const normalizedText = normalizeMemoryText(memoryText);
    if (seenMemoryTexts.has(normalizedText)) {
      duplicateCount += 1;
      continue;
    }
    seenMemoryTexts.add(normalizedText);
    memories.push({
      id: `memory-${compactTimestamp(now)}-${(state.memories?.length ?? 0) + memories.length + 1}`,
      memoryClass: finalMemoryClass,
      text: memoryText,
      source: provider,
      sourceRef,
      confidence: inferMemoryConfidence(memoryText, finalMemoryClass),
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
  const known = new Set(["session_start", "session_finish", "plan", "tool_call", "diff", "uncertainty", "subagent", "debrief", "codex_turn_start", "codex_turn_check", "codex_turn_finish", "activity"]);
  return known.has(value) ? value : "activity";
}

function normalizeActivityType(type) {
  const value = String(type ?? "activity").trim().toLowerCase().replaceAll("-", "_");
  const known = new Set(["session_start", "session_finish", "plan", "command", "tool_call", "file_change", "browser_action", "subagent", "analysis", "uncertainty", "debrief", "codex_turn_start", "codex_turn_check", "codex_turn_finish", "activity"]);
  return known.has(value) ? value : "activity";
}

function countBriefChecks(state, { missionId } = {}) {
  return (state.agentActivities ?? []).filter((activity) => activity.missionId === missionId && activity.evidence?.briefCheckId).length;
}

function countBriefDrift(state, { missionId, agentId } = {}) {
  return (state.agentActivities ?? [])
    .filter((activity) => activity.missionId === missionId)
    .filter((activity) => !agentId || activity.agentId === agentId)
    .filter((activity) => ["nudge", "queue", "pause"].includes(activity.evidence?.enforcement)).length;
}

function findBriefCheckActivity(state, checkId) {
  return (state.agentActivities ?? []).find((activity) => activity.evidence?.briefCheckId === checkId);
}

function classifyBriefPlanDrift(state, { missionId, agentId, plan, priorDriftCount } = {}) {
  const lower = String(plan ?? "").toLowerCase();
  const highRisk = /push|github|origin|deploy|production|external|credential|oauth|publish|financial|legal|reputation/.test(lower);
  const skipTests = /skip tests?|without tests?|no tests?|call it done|ignore tests?/i.test(plan ?? "");
  const match = selectBriefMemory(state, plan, { highRisk, skipTests });
  if (highRisk) {
    return {
      enforcement: "queue",
      drift: true,
      riskLevel: "high",
      section: "Authority boundaries",
      memory: match,
      reason: "High-risk brief conflict queued.",
      suggestedRewrite: "Queue this for Kyle instead of taking external, credential, deploy, publish, financial, legal, reputation, OAuth, or git push action.",
    };
  }
  if (skipTests) {
    if (priorDriftCount >= 2) {
      return {
        enforcement: "pause",
        drift: true,
        riskLevel: "medium",
        section: "Working style",
        memory: match,
        reason: "Repeated brief drift paused the agent.",
        suggestedRewrite: "Pause and ask Kyle before continuing. Then restart with focused tests, relevant verification, and debrief.",
      };
    }
    return {
      enforcement: "nudge",
      drift: true,
      riskLevel: "medium",
      section: "Working style",
      memory: match,
      reason: "Plan skips verification that Kyle's brief expects.",
      suggestedRewrite: "Run focused tests or a focused verification pass, then debrief what changed and what remains.",
    };
  }
  return {
    enforcement: "aligned",
    drift: false,
    riskLevel: "low",
    section: "Working style",
    memory: match,
    reason: "Plan is local and aligned with the active brief.",
  };
}

function selectBriefMemory(state, text, { highRisk = false, skipTests = false } = {}) {
  const reviewed = (state.memories ?? []).filter((memory) => ["approved", "pinned"].includes(memory.status));
  const preferred = highRisk
    ? reviewed.filter((memory) => /push|github|deploy|external|credential|oauth|approval|queue/i.test(memory.text ?? ""))
    : skipTests
      ? reviewed.filter((memory) => /test|verify|verification|debrief|no corners|focused/i.test(memory.text ?? ""))
      : reviewed;
  return findBestMemoryByTerms(preferred.length > 0 ? preferred : reviewed, text);
}

function findBestMemoryByTerms(memories, text) {
  const terms = String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((term) => term.length >= 4);
  return memories
    .map((memory) => ({
      memory,
      score: terms.reduce((total, term) => total + (String(memory.text ?? "").toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.memory ?? memories[0];
}

function normalizeBriefCorrectionVerdict(verdict) {
  const normalized = String(verdict ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (["not_drift", "always_queue", "allow_locally"].includes(normalized)) return normalized;
  throw new Error("verdict must be not_drift, always_queue, or allow_locally");
}

function briefCorrectionMemoryText(verdict, note) {
  if (verdict === "not_drift") return `This was not drift: ${note}`;
  if (verdict === "always_queue") return `Always queue this kind of brief drift: ${note}`;
  return `Allow locally when this comes up again: ${note}`;
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
      sourceMemoryId: policy.sourceMemoryId,
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

export function redactSensitiveText(value) {
  if (value === undefined || value === null) return value;
  return String(value)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\b(api[_-]?key|token|secret|credential|password)\s*[:=]\s*['"]?[^'"`\s]+/gi, "$1=[REDACTED]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [REDACTED]");
}

function redactToolCall(toolCall) {
  if (!toolCall) return toolCall;
  return {
    ...toolCall,
    arguments: Object.fromEntries(
      Object.entries(toolCall.arguments ?? {}).map(([key, value]) => [key, redactSensitiveText(value)]),
    ),
  };
}

function redactEvidence(evidence = {}) {
  return Object.fromEntries(
    Object.entries(evidence).map(([key, value]) => [key, redactSensitiveText(value)]),
  );
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

function buildPromptIntentMemoryText(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  const lower = compact.toLowerCase();
  if (/^what'?s next\??$|^whats next\??$/.test(lower)) {
    return `Kyle often says "what's next?" to request a concrete next implementation slice rather than a broad explanation.`;
  }
  if (/^proceed\.?$/.test(lower) || /\bthe user said proceed\b/.test(lower)) {
    return `Kyle uses "proceed" to authorize continuing previously discussed safe local work when it remains aligned with the active goal.`;
  }
  if (/\bdo all that\b|\bno corners\b|\bno cut corners\b|\bdogfood klemm\b/i.test(compact)) {
    return `Kyle uses "do all that", "no corners cut", or "dogfood Klemm" to mean full-effort safe local implementation, focused tests, verification, and debrief.`;
  }
  if (/\bkeep going\b|\bcontinue\b/i.test(compact) && /\bsafe local|implementation|tests?|verified|goal\b/i.test(compact)) {
    return `Kyle often asks agents to keep going when the next step is safe, local, testable, and tied to the current goal.`;
  }
  return null;
}

function classifyMemoryLine(line) {
  if (/\b(do not|don't|never|requires approval|without approval|explicitly approved|blocked|boundary|boundaries|queue|queued)\b/i.test(line)) {
    return "authority_boundary";
  }
  if (/\b(prefer|always|working style|terminal-first|cli-first|focused|run tests|before completion|review before risky|what'?s next|whats next|proceed|no corners|no cut corners|do all that|dogfood|keep going)\b/i.test(line)) {
    return "standing_preference";
  }
  if (/\b(github|repo|repository|commit|supervision|monitor|docs?|history|police all agents|agent infrastructure|source evidence|authority layers?)\b/i.test(line)) {
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
