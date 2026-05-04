import { spawn } from "node:child_process";

const SUPPORTED_EVENTS = new Set(["session_start", "plan", "tool_call", "diff", "uncertainty", "debrief", "session_finish", "activity"]);

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
    async send(envelopeToSend) {
      if (!options.transport?.send) throw new Error("Klemm adapter transport is required to send envelopes");
      return await options.transport.send(envelopeToSend);
    },
    async call(toolName, payload = {}) {
      if (!options.transport?.call) throw new Error("Klemm adapter transport is required to call Klemm tools");
      return await options.transport.call(toolName, {
        missionId: base.missionId,
        agentId: base.agentId,
        ...payload,
      });
    },
    async proxyAsk(payload = {}) {
      return await this.call("proxy_ask", payload);
    },
    async proxyContinue(payload = {}) {
      return await this.call("proxy_continue", payload);
    },
    async proxyStatus(payload = {}) {
      return await this.call("proxy_status", payload);
    },
    plan(payload = {}) {
      return envelope("plan", payload);
    },
    sessionStart(payload = {}) {
      return envelope("session_start", payload);
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
    sessionFinish(payload = {}) {
      return envelope("session_finish", payload);
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

export function createKlemmHttpTransport(options = {}) {
  const baseUrl = String(options.baseUrl ?? "http://127.0.0.1:8765").replace(/\/$/, "");
  const retries = Number(options.retries ?? 0);
  const negotiateProtocol = options.negotiateProtocol ?? false;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const daemonToken = options.daemonToken ?? process.env.KLEMM_DAEMON_TOKEN;
  if (!fetchImpl) throw new Error("fetch is required for Klemm HTTP transport");

  return {
    async call(toolName, payload = {}) {
      const route = httpToolRoute(toolName);
      const headers = { "content-type": "application/json" };
      if (daemonToken) headers.authorization = `Bearer ${daemonToken}`;
      const response = await fetchImpl(`${baseUrl}${route.path}${route.method === "GET" ? queryString(payload) : ""}`, {
        method: route.method,
        headers,
        ...(route.method === "GET" ? {} : { body: JSON.stringify(payload) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`Klemm HTTP tool failed: HTTP ${response.status} ${body.error ?? ""}`.trim());
      return body;
    },
    async send(envelope) {
      let current = { ...envelope };
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const headers = { "content-type": "application/json" };
        if (daemonToken) headers.authorization = `Bearer ${daemonToken}`;
        const response = await fetchImpl(`${baseUrl}/api/adapter/envelope`, {
          method: "POST",
          headers,
          body: JSON.stringify(current),
        });
        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = { error: `HTTP ${response.status}` };
        }
        if (!response.ok) {
          if (attempt < retries) continue;
          throw new Error(`Klemm HTTP transport failed: HTTP ${response.status} ${payload.error ?? ""}`.trim());
        }
        const supported = payload.protocol?.supportedVersions ?? [];
        const negotiated = highestSupportedVersion(supported);
        if (
          negotiateProtocol &&
          payload.accepted === false &&
          negotiated &&
          negotiated !== current.protocolVersion &&
          /protocol version/i.test(payload.error ?? "") &&
          attempt < retries
        ) {
          current = { ...current, protocolVersion: negotiated };
          continue;
        }
        if (payload.accepted === false) {
          throw new Error(`Klemm adapter rejected envelope: ${payload.error ?? "unknown error"}`);
        }
        return payload;
      }
      throw new Error("Klemm HTTP transport exhausted retries");
    },
  };
}

export function createKlemmMcpTransport(options = {}) {
  const command = options.command;
  if (!command) throw new Error("MCP transport command is required");
  const args = options.args ?? [];
  const env = options.env ?? process.env;

  return {
    async call(toolName, payload = {}) {
      const response = await callMcpTool({ command, args, env }, toolName, payload);
      if (response.isError) throw new Error(`Klemm MCP transport failed: ${response.content?.[0]?.text ?? "unknown error"}`);
      return response.structuredContent ?? JSON.parse(response.content?.[0]?.text ?? "{}");
    },
    async send(envelope) {
      const response = await callMcpTool({ command, args, env }, "record_adapter_envelope", envelope);
      if (response.isError) throw new Error(`Klemm MCP transport failed: ${response.content?.[0]?.text ?? "unknown error"}`);
      return response.structuredContent ?? JSON.parse(response.content?.[0]?.text ?? "{}");
    },
  };
}

function httpToolRoute(toolName) {
  if (toolName === "proxy_ask") return { method: "POST", path: "/api/proxy/ask" };
  if (toolName === "proxy_continue") return { method: "POST", path: "/api/proxy/continue" };
  if (toolName === "proxy_status") return { method: "GET", path: "/api/proxy/status" };
  throw new Error(`Klemm HTTP transport does not expose tool: ${toolName}`);
}

function queryString(payload = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
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

function highestSupportedVersion(supportedVersions) {
  return supportedVersions
    .map((version) => Number(version))
    .filter((version) => Number.isFinite(version))
    .sort((a, b) => b - a)[0];
}

async function callMcpTool({ command, args, env }, name, toolArguments) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (!last) return;
      try {
        const message = JSON.parse(last);
        if (message.id === 1) {
          child.kill("SIGTERM");
          resolve(message.result);
        }
      } catch {
        // Wait for a complete JSON-RPC line.
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status && status !== 0 && !stdout.trim()) reject(new Error(stderr || `MCP process exited ${status}`));
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: toolArguments,
      },
    })}\n`);
  });
}
