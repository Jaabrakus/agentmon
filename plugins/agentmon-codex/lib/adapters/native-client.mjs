import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function ingestAdapterBatch(options) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const token = options.token || (await readFile(resolve(rootDir, ".agentmon/daemon-token"), "utf8")).trim();
  const endpoint = options.endpoint || "http://127.0.0.1:4765/v1/ingest";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ slot: options.slot || "main", batch: options.batch, agent: options.agent || {} }),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error || `Agentmon daemon returned HTTP ${response.status}.`);
  return payload;
}
