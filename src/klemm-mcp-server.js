#!/usr/bin/env node
import { createInterface } from "node:readline";

import { createKlemmStore } from "./klemm-store.js";
import { executeKlemmTool, KLEMM_MCP_TOOLS } from "./klemm-tools.js";

const store = createKlemmStore();

const serverInfo = {
  name: "klemm",
  version: "0.1.0",
};

const capabilities = {
  tools: {
    listChanged: false,
  },
};

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) return;
  handleMessage(line);
});

process.on("SIGTERM", () => {
  store.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});

function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeError(null, -32700, "Parse error", error.message);
    return;
  }

  if (!message.id && message.method?.startsWith("notifications/")) return;

  try {
    if (message.method === "initialize") {
      writeResult(message.id, {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities,
        serverInfo,
      });
      return;
    }

    if (message.method === "tools/list") {
      writeResult(message.id, {
        tools: KLEMM_MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: "object",
            additionalProperties: true,
          },
        })),
      });
      return;
    }

    if (message.method === "tools/call") {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      const output = executeKlemmTool(name, args, { state: store.getState() });
      store.saveState(output.state);
      writeResult(message.id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(output.result),
          },
        ],
        structuredContent: output.result,
        isError: false,
      });
      return;
    }

    writeError(message.id, -32601, "Method not found");
  } catch (error) {
    writeResult(message.id, {
      content: [
        {
          type: "text",
          text: error.message,
        },
      ],
      isError: true,
    });
  }
}

function writeResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id, code, message, data) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } })}\n`);
}
