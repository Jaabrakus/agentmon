#!/usr/bin/env node

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeedFromAdapterBatch } from "../lib/adapter-contract.mjs";
import { createLocalModelProvider, localModelConfigFromEnv } from "../lib/local-model-provider.mjs";
import { createLocalVault } from "../lib/privacy/local-vault.mjs";
import { listAgentmonSnapshots, readAgentmonSnapshot } from "./agentmon-db.mjs";
import { processFeed } from "./agentmon.mjs";
import { recordOutcomeFeedback, reviewAndPromoteSemanticProcedure, routeContext, suggestSemanticProcedures } from "../lib/runtime/v4-learning-service.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const MAX_BODY_BYTES = 1_048_576;
const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[a-z0-9_-]+$/i;

function safeSlot(value) {
  const slot = String(value || "main").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slot)) throw new Error("Invalid Agentmon slot.");
  return slot;
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function ensureDaemonToken(rootDir) {
  const tokenPath = resolve(rootDir, ".agentmon/daemon-token");
  try {
    const token = (await readFile(tokenPath, "utf8")).trim();
    if (token.length >= 32) return { token, tokenPath };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
  return { token, tokenPath };
}

function authorized(request, token) {
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expectedBuffer = Buffer.from(token);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function sendJson(response, status, payload, origin = null) {
  const body = `${JSON.stringify(payload)}\n`;
  const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" };
  if (origin) { headers["Access-Control-Allow-Origin"] = origin; headers.Vary = "Origin"; }
  response.writeHead(status, headers);
  response.end(body);
}

function suppliedBearer(request) {
  return String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

function tokenDigest(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function readRequestJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request exceeds the 1 MiB local ingestion limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function safeAgentmonProfile(agentmon) {
  return {
    format: "agentmon.local-profile/v1",
    id: agentmon.id,
    species: agentmon.species,
    form: agentmon.form ?? agentmon.species,
    nameForge: agentmon.nameForge,
    creationVersion: agentmon.creationVersion,
    nature: agentmon.nature,
    archetype: agentmon.promptprint?.archetype,
    promptprint: agentmon.promptprint?.signature,
    confidence: agentmon.growthPromptprint?.confidence ?? agentmon.promptprint?.confidence,
    lineage: agentmon.lineage,
    hatchReadiness: agentmon.hatchReadiness,
    behaviorHypotheses: agentmon.behaviorHypotheses ?? [],
    proceduralSkills: agentmon.proceduralSkills ?? [],
    arenaReport: agentmon.arenaReport,
    effectivenessReport: agentmon.effectivenessReport,
    portabilityReport: agentmon.portabilityReport,
    privacy: { rawPromptsIncluded: false, credentialsIncluded: false, hiddenReasoningIncluded: false },
  };
}

export async function startAgentmonDaemon(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const host = String(options.host || "127.0.0.1");
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("Agentmon daemon may bind only to a loopback address.");
  const port = Number.isInteger(options.port) ? options.port : Number(options.port) || 4765;
  const identity = await ensureDaemonToken(rootDir);
  const localModel = createLocalModelProvider(options.localModelConfig || localModelConfigFromEnv(options.environment));
  const vault = options.vault || createLocalVault(rootDir, options.vaultOptions);
  const browserPairingCode = options.browserPairingCode || randomBytes(9).toString("base64url");
  let pairingAvailable = true;
  const browserTokens = new Map();

  const server = createServer((request, response) => {
    const requestOrigin = String(request.headers.origin || "");
    void (async () => {
      const origin = requestOrigin;
      const extensionRequest = EXTENSION_ORIGIN.test(origin);
      const requestUrl = new URL(request.url || "/", `http://${host}`);
      const browserRoute = requestUrl.pathname.startsWith("/v1/browser/");
      if (origin && (!extensionRequest || !browserRoute)) return sendJson(response, 403, { error: "Browser origin is not allowed for this endpoint." });
      if (request.method === "OPTIONS" && extensionRequest && browserRoute) {
        response.writeHead(204, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "600", Vary: "Origin" });
        return response.end();
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/browser/pair" && extensionRequest) {
        const input = await readRequestJson(request);
        if (!pairingAvailable || !authorized({ headers: { authorization: `Bearer ${input.code || ""}` } }, browserPairingCode)) return sendJson(response, 401, { error: "Invalid or expired pairing code." }, origin);
        const token = randomBytes(32).toString("base64url");
        browserTokens.set(tokenDigest(token), { origin, pairedAt: new Date().toISOString() });
        pairingAvailable = false;
        return sendJson(response, 200, { format: "agentmon.browser-pair/v1", token, scope: "submit-user-prompts-only", retention: "derived-only" }, origin);
      }

      if (browserRoute && extensionRequest) {
        const grant = browserTokens.get(tokenDigest(suppliedBearer(request)));
        if (!grant || grant.origin !== origin) return sendJson(response, 401, { error: "Browser connector is not paired." }, origin);
        if (request.method === "GET" && requestUrl.pathname === "/v1/browser/status") return sendJson(response, 200, { format: "agentmon.browser-status/v1", status: "paired", retention: "derived-only", rawPromptsStored: false }, origin);
        if (request.method === "POST" && requestUrl.pathname === "/v1/browser/ingest") {
          const input = await readRequestJson(request);
          const site = String(input.site || "browser").replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 128);
          const conversation = String(input.conversation || "current").replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 128);
          const eventId = String(input.eventId || randomBytes(8).toString("hex")).replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 128);
          const batch = { format: "agentmon.adapter-batch/v1", adapter: "browser-extension", mode: "append", conversation: { id: `${site}:${conversation}`, label: `${site} browser prompt` }, consent: { scope: "user_prompts_only", grantedAt: input.consentedAt || new Date().toISOString() }, events: [{ id: eventId, role: "user", content: input.content }] };
          const feed = createFeedFromAdapterBatch(batch);
          const result = await processFeed(feed, { rootDir, slot: safeSlot(input.slot), retention: "derived-only", provider: "custom", model: site });
          return sendJson(response, 200, { format: "agentmon.browser-ingest/v1", changed: result.changed, action: result.action, agentmon: { id: result.agentmon.id, species: result.agentmon.species, readiness: result.agentmon.hatchReadiness }, privacy: { retention: "derived-only", rawPromptsStored: false, rawPromptsLeaveDevice: false } }, origin);
        }
        return sendJson(response, 404, { error: "Browser connector endpoint not found." }, origin);
      }

      if (!authorized(request, identity.token)) return sendJson(response, 401, { error: "Unauthorized." });

      if (request.method === "GET" && requestUrl.pathname === "/v1/health") {
        return sendJson(response, 200, {
          format: "agentmon.daemon-health/v1",
          status: "ready",
          binding: "loopback-only",
          privacy: "local-first",
          rawFeedStorage: "aes-256-gcm-encrypted",
          localModel: await localModel.status(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/v1/agentmons") {
        return sendJson(response, 200, { format: "agentmon.roster/v1", members: await listAgentmonSnapshots(rootDir) });
      }

      const profileMatch = request.method === "GET" && requestUrl.pathname.match(/^\/v1\/agentmons\/([a-z0-9-]+)$/);
      if (profileMatch) {
        const state = await readAgentmonSnapshot(rootDir, safeSlot(profileMatch[1]));
        if (!state) return sendJson(response, 404, { error: "Agentmon not found." });
        return sendJson(response, 200, safeAgentmonProfile(state));
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/ingest") {
        const input = await readRequestJson(request);
        const slot = safeSlot(input.slot);
        const feedRecord = `feeds/${slot}`;
        const existingFeed = await vault.readJson(feedRecord);
        const feed = createFeedFromAdapterBatch(input.batch, existingFeed);
        await vault.writeJson(feedRecord, feed);
        const agent = input.agent || {};
        const agentOptions = {
          ...(agent.name ? { name: String(agent.name).slice(0, 100) } : {}),
          ...(agent.role ? { role: String(agent.role) } : {}),
          ...(agent.provider ? { provider: String(agent.provider) } : {}),
          ...(agent.model ? { model: String(agent.model).slice(0, 200) } : {}),
          ...(agent.mission ? { mission: String(agent.mission).slice(0, 1_000) } : {}),
          rootDir,
          slot,
        };
        const result = await processFeed(feed, agentOptions);
        return sendJson(response, 200, {
          format: "agentmon.ingest-result/v1",
          changed: result.changed,
          action: result.action,
          slot,
          agentmon: { id: result.agentmon.id, species: result.agentmon.species, readiness: result.agentmon.hatchReadiness },
          accepted: feed.totals,
          privacy: { rawDataLocation: "encrypted-local-vault-only", encryption: "AES-256-GCM", rawPromptTextReturned: false },
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/route") {
        const input = await readRequestJson(request);
        const query = String(input.query || "");
        if (!query.trim() || query.length > 100_000) throw new Error("Route query must contain 1-100,000 characters.");
        const route = await routeContext({
          rootDir,
          query,
          allowedPermissions: Array.isArray(input.allowedPermissions) ? input.allowedPermissions.map(String) : [],
          maxAgentmons: input.maxAgentmons,
          maxProcedures: input.maxProcedures,
          allowTesting: input.allowTesting === true,
        });
        return sendJson(response, 200, route || { format: "agentmon.context-route/v1", selected: null, privacy: { rawQueryStored: false, rawQueryIncluded: false } });
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/outcomes") {
        const input = await readRequestJson(request);
        const result = await recordOutcomeFeedback({ ...input, rootDir, slot: safeSlot(input.slot), procedureIds: input.procedureIds });
        return sendJson(response, 200, { format: "agentmon.outcome-result/v1", effectiveness: result.effectiveness, privacy: { rawPromptsStored: false, rawResponsesStored: false, proofEligible: false } });
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/semantic/suggest") {
        const input = await readRequestJson(request);
        const result = await suggestSemanticProcedures({ rootDir, slot: safeSlot(input.slot), provider: localModel });
        return sendJson(response, 200, { format: "agentmon.semantic-suggestions/v1", candidates: result.agentmon.procedureProposals || [], deployable: false, rawPromptsIncluded: false });
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/semantic/review") {
        const input = await readRequestJson(request);
        const result = await reviewAndPromoteSemanticProcedure({ rootDir, slot: safeSlot(input.slot), proposal: input.proposal, review: input.review });
        return sendJson(response, 200, { format: "agentmon.semantic-review/v1", proposal: input.proposal, review: input.review, arenaRequired: input.review === "confirmed", agentmonId: result.agentmon.id });
      }

      if (request.method === "POST" && requestUrl.pathname === "/v1/local/suggestions") {
        const input = await readRequestJson(request);
        const slot = safeSlot(input.slot);
        const feed = await vault.readJson(`feeds/${slot}`);
        if (!feed) return sendJson(response, 404, { error: "No local feed exists for this slot." });
        const requested = new Set((input.sourceIds || []).map(String));
        const prompts = requested.size ? feed.prompts.filter((prompt) => requested.has(String(prompt.id))) : feed.prompts.slice(-20);
        const suggestions = await localModel.classify(prompts);
        const artifact = {
          format: "agentmon.local-suggestions/v1",
          generatedAt: new Date().toISOString(),
          mode: "shadow",
          suggestions,
          rawPromptTextStored: false,
        };
        await atomicWriteJson(resolve(rootDir, ".agentmon/roster", slot, "local-suggestions.json"), artifact);
        return sendJson(response, 200, artifact);
      }

      return sendJson(response, 404, { error: "Not found." });
    })().catch((error) => sendJson(response, 400, { error: error.message }, EXTENSION_ORIGIN.test(requestOrigin) ? requestOrigin : null));
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolvePromise);
  });
  return {
    server,
    rootDir,
    host,
    port: server.address().port,
    tokenPath: identity.tokenPath,
    token: identity.token,
    browserPairingCode,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

function parseArgs(argv) {
  const options = { rootDir: process.cwd(), host: "127.0.0.1", port: 4765 };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === "--cwd") { options.rootDir = resolve(value); index += 1; }
    else if (option === "--host") { options.host = value; index += 1; }
    else if (option === "--port") { options.port = Number(value); index += 1; }
    else throw new Error(`Unknown option: ${option}`);
  }
  return options;
}

function invokedAsMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(SCRIPT_PATH); }
  catch { return false; }
}

if (invokedAsMain()) {
  startAgentmonDaemon(parseArgs(process.argv.slice(2))).then((daemon) => {
    process.stdout.write(`Agentmon daemon ready at http://${daemon.host}:${daemon.port}\nToken file: ${daemon.tokenPath}\nBrowser pairing code: ${daemon.browserPairingCode}\nBrowser prompts use derived-only retention and are never written to the vault or database.\n`);
    const stop = () => void daemon.close().finally(() => process.exit(0));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }).catch((error) => {
    process.stderr.write(`Agentmon daemon failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
