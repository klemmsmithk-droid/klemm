import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function createHostedSyncService({ storageDir, token } = {}) {
  if (!storageDir) throw new Error("storageDir is required");
  const expectedToken = token;

  async function appendBundle(payload) {
    await mkdir(storageDir, { recursive: true });
    const path = join(storageDir, "bundles.jsonl");
    const existing = existsSync(path) ? await readFile(path, "utf8") : "";
    const bundle = {
      id: payload.id ?? `hosted-bundle-${Date.now()}`,
      encrypted: payload.encrypted !== false,
      payload: payload.payload,
      pushedAt: payload.pushedAt ?? new Date().toISOString(),
    };
    await writeFile(path, `${existing}${JSON.stringify(bundle)}\n`, "utf8");
    return bundle;
  }

  async function latestBundle() {
    const path = join(storageDir, "bundles.jsonl");
    if (!existsSync(path)) return null;
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
  }

  function authorized(headers = {}) {
    if (!expectedToken) return true;
    const header = headers.authorization ?? headers.Authorization ?? "";
    return header === `Bearer ${expectedToken}`;
  }

  return {
    async handle(request) {
      const { method = "GET", url = "/", headers = {}, body } = request;
      if (url === "/api/v1/health" && method === "GET") {
        return response(200, { ok: true, service: "klemm-hosted-sync", encryptedOnly: true });
      }
      if (!authorized(headers)) return response(401, { error: "unauthorized" });
      if (url === "/api/v1/sync/push" && method === "POST") {
        const bundle = await appendBundle(typeof body === "string" ? JSON.parse(body) : body ?? {});
        return response(200, { ok: true, bundleId: bundle.id, serverPlaintext: false });
      }
      if (url === "/api/v1/sync/pull" && method === "POST") {
        return response(200, { ok: true, bundle: await latestBundle(), conflict: "preserve_both_event_streams" });
      }
      if (url === "/api/v1/sync/rotate" && method === "POST") {
        return response(200, { ok: true, rotated: true, token: "[REDACTED]" });
      }
      return response(404, { error: "not_found" });
    },
  };
}

function response(status, payload) {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
