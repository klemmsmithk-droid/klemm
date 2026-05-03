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

      if (request.method === "POST" && url.pathname === "/api/supervised-runs") {
        return runTool(response, "record_supervised_run", await readJson(request), { getState, saveState });
      }

      if (request.method === "POST" && url.pathname === "/api/os/observations") {
        return runTool(response, "record_os_observation", await readJson(request), { getState, saveState });
      }

      if (request.method === "GET" && url.pathname === "/api/os/status") {
        return runTool(response, "get_os_status", { missionId: url.searchParams.get("mission") }, { getState, saveState });
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
