#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmod, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { certifyCanonicalAgentmon, finalizeAuthorityTransfer, initializeAuthorityRegistry, issueListingCertificate, readAuthorityRecord } from "../lib/economy/authority-registry.mjs";
import { authorizeStateTransition, issueLearningTransitionAttestation } from "../lib/economy/transition-authority.mjs";
import { atomicWrite } from "../lib/runtime/storage.mjs";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

async function jsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds 2 MiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function respond(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(`${JSON.stringify(value)}\n`);
}

async function loadOrCreateToken(registryRoot) {
  const path = resolve(registryRoot, "registry-token");
  try { return { path, token: (await readFile(path, "utf8")).trim() }; }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const token = randomBytes(32).toString("hex");
    await atomicWrite(path, `${token}\n`);
    await chmod(path, 0o600);
    return { path, token };
  }
}

export async function startEconomyRegistryServer(options = {}) {
  const registryRoot = resolve(options.registryRoot || ".agentmon-authority");
  const authority = await initializeAuthorityRegistry(registryRoot, { name: options.name });
  const auth = await loadOrCreateToken(registryRoot);
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.origin) return respond(response, 403, { error: "Browser origins are not accepted." });
      if (request.headers.authorization !== `Bearer ${auth.token}`) return respond(response, 401, { error: "Unauthorized." });
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/v1/health") return respond(response, 200, { format: "agentmon.economy-service/v1", binding: "loopback-only", authorityFingerprint: authority.fingerprint });
      if (request.method === "GET" && url.pathname.startsWith("/v1/agentmons/")) {
        const agentmonId = decodeURIComponent(url.pathname.slice("/v1/agentmons/".length));
        return respond(response, 200, await readAuthorityRecord(registryRoot, agentmonId));
      }
      if (request.method !== "POST") return respond(response, 404, { error: "Not found." });
      const input = await jsonBody(request);
      if (url.pathname === "/v1/certifications") return respond(response, 201, await certifyCanonicalAgentmon(registryRoot, input));
      if (url.pathname === "/v1/attestations/learning") return respond(response, 201, await issueLearningTransitionAttestation(registryRoot, input));
      if (url.pathname === "/v1/transitions") return respond(response, 201, await authorizeStateTransition(registryRoot, input));
      if (url.pathname === "/v1/listings") return respond(response, 201, await issueListingCertificate(registryRoot, input));
      if (url.pathname === "/v1/transfers") return respond(response, 201, await finalizeAuthorityTransfer(registryRoot, input));
      return respond(response, 404, { error: "Not found." });
    } catch (error) {
      return respond(response, 400, { error: error.message });
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(Number(options.port) || 0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  return {
    registryRoot,
    token: auth.token,
    tokenPath: auth.path,
    authorityFingerprint: authority.fingerprint,
    port: address.port,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registryIndex = process.argv.indexOf("--registry-root");
  const portIndex = process.argv.indexOf("--port");
  const service = await startEconomyRegistryServer({
    registryRoot: registryIndex >= 0 ? process.argv[registryIndex + 1] : undefined,
    port: portIndex >= 0 ? Number(process.argv[portIndex + 1]) : undefined,
  });
  process.stdout.write(`Agentmon economy authority listening on http://127.0.0.1:${service.port}\nToken file: ${service.tokenPath}\nAuthority: ${service.authorityFingerprint}\n`);
  const stop = () => service.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
