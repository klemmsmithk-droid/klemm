import { createServer } from "node:http";

import { getKlemmStatus, renderKlemmDashboard, summarizeDebrief } from "./klemm.js";
import { executeKlemmTool } from "./klemm-tools.js";

export function createKlemmHttpServer({ getState, saveState }) {
  const startedAt = Date.now();
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/api/health") {
        const state = getState();
        return sendJson(response, 200, {
          status: "ok",
          version: state.version ?? 1,
          uptimeMs: Date.now() - startedAt,
          updatedAt: state.updatedAt,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        return sendJson(response, 200, getKlemmStatus(getState()));
      }

      if (request.method === "GET" && url.pathname === "/api/debrief") {
        return sendJson(response, 200, {
          debrief: summarizeDebrief(getState(), { missionId: url.searchParams.get("mission") }),
        });
      }

      if (request.method === "GET" && url.pathname === "/api/dashboard") {
        return sendJson(response, 200, {
          dashboard: renderKlemmDashboard(getState(), { missionId: url.searchParams.get("mission") }),
        });
      }

      if (request.method === "GET" && url.pathname === "/api/codex/context") {
        return runTool(response, "codex_context", { missionId: url.searchParams.get("mission") }, { getState, saveState });
      }

      if (request.method === "GET" && url.pathname === "/api/user/model") {
        return runTool(response, "get_user_model_summary", { includePending: true }, { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/codex/hub") {
        return runTool(response, "start_codex_hub", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/mission/start") {
        return runTool(response, "start_mission", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/agents/register") {
        return runTool(response, "register_agent", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/authority/request") {
        return runTool(response, "request_authority", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/events") {
        return runTool(response, "record_agent_event", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/queue/outcome") {
        return runTool(response, "record_outcome", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/memory/ingest") {
        return runTool(response, "distill_memory", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/memory/ingest-export") {
        return runTool(response, "ingest_memory_export", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/memory/review") {
        return runTool(response, "review_memory", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/memory/promote-policy") {
        return runTool(response, "promote_memory_policy", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/context/import") {
        return runTool(response, "import_context_source", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/supervised-runs") {
        return runTool(response, "record_supervised_run", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/os/observations") {
        if (!requireDaemonToken(request, response)) return;
        return runTool(response, "record_os_observation", await readJson(request), { getState, saveState });
      }

      if (request.method === "GET" && url.pathname === "/api/os/status") {
        return runTool(response, "get_os_status", { missionId: url.searchParams.get("mission") }, { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/monitor/activity") {
        return runTool(response, "record_agent_activity", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/adapter/envelope") {
        if (!requireDaemonToken(request, response)) return;
        return runTool(response, "record_adapter_envelope", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/monitor/evaluate") {
        return runTool(response, "evaluate_agent_alignment", await readJson(request), { getState, saveState });
      }

      if (request.method === "GET" && url.pathname === "/api/monitor/status") {
        return runTool(response, "get_agent_monitor", {
          missionId: url.searchParams.get("mission"),
          agentId: url.searchParams.get("agent"),
        }, { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/policies") {
        return runTool(response, "add_structured_policy", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/memory/sources") {
        return runTool(response, "import_memory_source", await readJson(request), { getState, saveState });
      }

      if (request.method === "GET" && url.pathname === "/api/memory/search") {
        return runTool(response, "search_memories", { query: url.searchParams.get("query") ?? "" }, { getState, saveState });
      }

      sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

async function runTool(response, toolName, args, { getState, saveState }) {
  const output = executeKlemmTool(toolName, args, { state: getState() });
  saveState(output.state);
  sendJson(response, 200, output.result);
}

function requireDaemonToken(request, response) {
  const expected = process.env.KLEMM_DAEMON_TOKEN;
  if (!expected) return true;
  const authorization = request.headers.authorization ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const headerToken = Array.isArray(request.headers["x-klemm-daemon-token"])
    ? request.headers["x-klemm-daemon-token"][0]
    : request.headers["x-klemm-daemon-token"];
  if (bearer === expected || headerToken === expected) return true;
  sendJson(response, 401, { error: "Klemm daemon token required" });
  return false;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
