import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { routeDesktopActionRequest } from "./desktop-action-routes.mjs";
import { createAutomaticDownlink, createDownlink, readAgentmonStatus } from "./desktop-downlink-service.mjs";
import { createDesktopModelProviderRoutes } from "./desktop-model-provider-routes.mjs";
import { createDesktopMarketplaceService } from "./desktop-marketplace-service.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[a-z0-9_-]+$/i;
const MAX_BODY_BYTES = 1_048_576;

async function loadV4(engineRoot) {
  return import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/runtime/v4-learning-service.mjs")).href);
}

function safeSlot(value) {
  const slot = String(value || "main").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slot)) throw new Error("Invalid Agentmon slot.");
  return slot;
}

function safeConversation(value) {
  const conversation = String(value || "current").trim();
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(conversation)) throw new Error("Invalid Agentmon conversation id.");
  return conversation;
}

function requireEnabledSite(grant, value) {
  const site = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(site)) throw new Error("Invalid site hostname.");
  if (grant.sites.get(site)?.enabled !== true) throw new Error("This site is not enabled for Agentmon.");
  return site;
}

function tokenDigest(token) {
  return createHash("sha256").update(token).digest("hex");
}

function bearer(request) {
  return String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

function authorized(request, token) {
  const supplied = Buffer.from(bearer(request));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function sendJson(response, status, payload, origin = null) {
  const body = `${JSON.stringify(payload)}\n`;
  const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" };
  if (origin) { headers["Access-Control-Allow-Origin"] = origin; headers.Vary = "Origin"; }
  response.writeHead(status, headers);
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request exceeds the 1 MiB local limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export async function startDesktopBrowserServer(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const engineRoot = resolve(options.engineRoot || rootDir);
  const host = String(options.host || "127.0.0.1");
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("Desktop server may bind only to loopback.");
  const port = Number.isInteger(options.port) ? options.port : Number(options.port) || 4765;
  const identity = { token: randomBytes(32).toString("base64url") };
  const pairingCode = options.pairingCode || randomBytes(9).toString("base64url");
  const browserTokens = new Map();
  let pairingAvailable = true;
  const localModelConfigPath = resolve(rootDir, ".agentmon/local-model.json");
  const modelProviderConfigPath = resolve(rootDir, ".agentmon/model-provider.json");
  let localModelConfig = { format: "agentmon.local-model/v1", baseUrl: "http://127.0.0.1:11434/v1", model: null };
  let modelProviderConfig = { format: "agentmon.model-provider/v1", provider: "local", model: null, baseUrl: localModelConfig.baseUrl };
  try {
    const stored = JSON.parse(await readFile(localModelConfigPath, "utf8"));
    const { assertLoopbackModelUrl } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/local-model-provider.mjs")).href);
    localModelConfig = {
      format: "agentmon.local-model/v1",
      baseUrl: assertLoopbackModelUrl(stored.baseUrl).toString().replace(/\/$/, ""),
      model: String(stored.model || "").trim() || null,
    };
  } catch {}
  modelProviderConfig = { format: "agentmon.model-provider/v1", provider: "local", model: localModelConfig.model, baseUrl: localModelConfig.baseUrl };
  try {
    const stored = JSON.parse(await readFile(modelProviderConfigPath, "utf8"));
    const provider = String(stored.provider || "").trim().toLowerCase();
    if (!new Set(["local", "openai", "gemini"]).has(provider)) throw new Error("Unsupported stored provider.");
    modelProviderConfig = {
      format: "agentmon.model-provider/v1",
      provider,
      model: String(stored.model || "").trim() || null,
      ...(provider === "local" ? { baseUrl: String(stored.baseUrl || localModelConfig.baseUrl) } : {}),
    };
  } catch {}

  async function localProvider(config = localModelConfig, timeoutMs = 30_000) {
    const { createLocalModelProvider } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/local-model-provider.mjs")).href);
    return createLocalModelProvider({ ...config, timeoutMs });
  }

  async function saveLocalModelConfig(config) {
    await mkdir(resolve(rootDir, ".agentmon"), { recursive: true });
    await writeFile(localModelConfigPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }

  async function saveModelProviderConfig(config) {
    const descriptor = {
      format: "agentmon.model-provider/v1",
      provider: config.provider,
      model: config.model,
      ...(config.provider === "local" ? { baseUrl: config.baseUrl } : {}),
    };
    await mkdir(resolve(rootDir, ".agentmon"), { recursive: true });
    await writeFile(modelProviderConfigPath, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
    modelProviderConfig = descriptor;
  }

  const modelProviderRoutes = createDesktopModelProviderRoutes({
    rootDir, engineRoot, readJson, sendJson, safeSlot, safeConversation, createAutomaticDownlink, loadV4, localProvider,
    getLocalModelConfig: () => localModelConfig,
    setLocalModelConfig: async (config) => { localModelConfig = config; await saveLocalModelConfig(config); },
    getModelProviderConfig: () => modelProviderConfig,
    saveModelProviderConfig,
  });
  const marketplace = createDesktopMarketplaceService({
    rootDir,
    engineRoot,
    fetchImpl: options.fetchImpl,
    allowHttp: options.allowHttpRegistry === true,
  });

  const server = createServer((request, response) => {
    const requestOrigin = String(request.headers.origin || "");
    void (async () => {
      const origin = requestOrigin;
      const extensionRequest = EXTENSION_ORIGIN.test(origin);
      const url = new URL(request.url || "/", `http://${host}`);
      const browserRoute = url.pathname.startsWith("/v1/browser/");
      if (origin && (!extensionRequest || !browserRoute)) return sendJson(response, 403, { error: "Browser origin is not allowed for this endpoint." });
      if (request.method === "OPTIONS" && extensionRequest && browserRoute) {
        response.writeHead(204, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" });
        return response.end();
      }

      if (request.method === "POST" && url.pathname === "/v1/browser/pair" && extensionRequest) {
        const input = await readJson(request);
        const supplied = Buffer.from(String(input.code || ""));
        const expected = Buffer.from(pairingCode);
        const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected);
        if (!pairingAvailable || !valid) return sendJson(response, 401, { error: "Invalid or expired pairing code." }, origin);
        const token = randomBytes(32).toString("base64url");
        browserTokens.set(tokenDigest(token), {
          origin,
          pairedAt: new Date().toISOString(),
          site: null,
          siteEnabled: false,
          lastSeenAt: new Date().toISOString(),
          lastPromptAt: null,
          promptCount: 0,
          sites: new Map(),
          activations: new Map(),
          lastTasks: new Map(),
        });
        pairingAvailable = false;
        return sendJson(response, 200, {
          format: "agentmon.browser-pair/v1",
          token,
          scope: "site-opt-in-local-companion",
          scopes: { submittedPrompts: "approved-llm-sites-only", semanticActions: "separate-per-site-opt-in" },
          retention: "derived-only",
        }, origin);
      }

      if (browserRoute && extensionRequest) {
        const grant = browserTokens.get(tokenDigest(bearer(request)));
        if (!grant || grant.origin !== origin) return sendJson(response, 401, { error: "Browser connector is not paired." }, origin);
        if (request.method === "GET" && url.pathname === "/v1/browser/status") {
          grant.lastSeenAt = new Date().toISOString();
          const agentmon = await readAgentmonStatus(rootDir, engineRoot, "main");
          return sendJson(response, 200, {
            format: "agentmon.browser-status/v1",
            status: "paired",
            site: grant.site,
            siteEnabled: grant.siteEnabled,
            retention: "derived-only",
            rawPromptsStored: false,
            actionLearningEnabled: grant.site ? grant.sites.get(grant.site)?.actionLearningEnabled === true : false,
            activeAgentmon: [...grant.activations.values()][0]?.agentmon ?? null,
            agentmon,
            marketplace: marketplace.browserSummary(),
          }, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/browser/open-home") {
          if (process.platform === "darwin") {
            const { execFile } = await import("node:child_process");
            execFile("/usr/bin/open", ["-b", "com.agentmon.local-incubator"], () => {});
          }
          return sendJson(response, 200, { opened: process.platform === "darwin", destination: "Agentmon Home", marketplace: marketplace.browserSummary() }, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/browser/site-state") {
          const input = await readJson(request);
          const site = String(input.site || "").trim().toLowerCase();
          if (!/^[a-z0-9.-]{1,253}$/.test(site)) throw new Error("Invalid site hostname.");
          grant.site = site;
          grant.siteEnabled = input.enabled === true;
          const previous = grant.sites.get(site);
          grant.sites.set(site, { site, enabled: grant.siteEnabled, actionLearningEnabled: previous?.actionLearningEnabled === true && grant.siteEnabled, updatedAt: new Date().toISOString() });
          grant.lastSeenAt = new Date().toISOString();
          return sendJson(response, 200, {
            format: "agentmon.browser-site-state/v1",
            status: "paired",
            site: grant.site,
            siteEnabled: grant.siteEnabled,
          }, origin);
        }
        if (await routeDesktopActionRequest({ request, response, url, origin, grant, rootDir, engineRoot, safeSlot, readJson, sendJson })) return;
        if (request.method === "POST" && url.pathname === "/v1/browser/activate") {
          const input = await readJson(request);
          const conversation = safeConversation(input.conversation);
          if (input.action === "off") {
            grant.activations.delete(conversation);
            return sendJson(response, 200, { format: "agentmon.browser-activation/v1", active: false, conversation }, origin);
          }
          const slot = safeSlot(input.slot);
          const downlink = await createDownlink(rootDir, engineRoot, slot);
          grant.activations.set(conversation, downlink);
          return sendJson(response, 200, { format: "agentmon.browser-activation/v1", active: true, conversation, ...downlink }, origin);
        }
        if (request.method === "GET" && url.pathname === "/v1/browser/downlink") {
          const conversation = safeConversation(url.searchParams.get("conversation"));
          const downlink = grant.activations.get(conversation) ?? null;
          return sendJson(response, 200, { format: "agentmon.browser-downlink-status/v1", active: Boolean(downlink), conversation, downlink }, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/browser/route") {
          const input = await readJson(request);
          const site = requireEnabledSite(grant, input.site);
          const conversation = safeConversation(input.conversation);
          const slot = safeSlot(input.slot);
          const query = String(input.content || "").trim();
          if (!query || query.length > 100_000) throw new Error("Submitted prompt must contain 1-100,000 characters.");
          const downlink = await createAutomaticDownlink(rootDir, engineRoot, slot, query);
          if (downlink) grant.activations.set(conversation, downlink);
          else grant.activations.delete(conversation);
          grant.site = site;
          grant.lastSeenAt = new Date().toISOString();
          return sendJson(response, 200, {
            format: "agentmon.browser-route/v1",
            active: Boolean(downlink),
            conversation,
            downlink,
            privacy: { rawPromptStored: false, rawPromptReturned: false, rawPromptSentToAgentmonCloud: false, downlinkSentToActiveModelProvider: Boolean(downlink) },
          }, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/browser/outcome") {
          const input = await readJson(request);
          const conversation = safeConversation(input.conversation);
          const task = grant.lastTasks.get(conversation);
          if (!task?.procedureIds?.length) throw new Error("No proven Agentmon procedure was active for the last submitted task.");
          const { recordOutcomeFeedback } = await loadV4(engineRoot);
          const result = await recordOutcomeFeedback({
            rootDir,
            slot: task.slot,
            conversation,
            taskDigest: task.taskDigest,
            procedureIds: task.procedureIds,
            outcome: input.outcome,
            rating: input.rating,
            retryCount: input.retryCount,
            correctionLevel: input.correctionLevel,
            provider: task.provider,
            model: task.model,
          });
          grant.lastTasks.delete(conversation);
          return sendJson(response, 200, {
            format: "agentmon.browser-outcome/v1",
            recorded: true,
            score: result.effectiveness.averageScore,
            totalOutcomes: result.effectiveness.totalOutcomes,
            privacy: { rawPromptsStored: false, rawResponsesStored: false, proofEligible: false },
          }, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/browser/ingest") {
          const input = await readJson(request);
          const [{ createFeedFromAdapterBatch }, { processFeed }] = await Promise.all([
            import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/adapter-contract.mjs")).href),
            import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/scripts/agentmon.mjs")).href),
          ]);
          const site = requireEnabledSite(grant, input.site);
          grant.site = site;
          grant.siteEnabled = true;
          grant.lastSeenAt = new Date().toISOString();
          grant.lastPromptAt = grant.lastSeenAt;
          grant.promptCount += 1;
          const conversation = safeConversation(input.conversation);
          const eventId = String(input.eventId || randomBytes(8).toString("hex")).replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 128);
          const batch = { format: "agentmon.adapter-batch/v1", adapter: "browser-extension", mode: "append", conversation: { id: `${site}:${conversation}`, label: `${site} browser prompt` }, consent: { scope: "user_prompts_only", grantedAt: input.consentedAt || new Date().toISOString() }, events: [{ id: eventId, role: "user", content: input.content }] };
          const feed = createFeedFromAdapterBatch(batch);
          const result = await processFeed(feed, { rootDir, slot: safeSlot(input.slot), retention: "derived-only", provider: "custom", model: site });
          const active = grant.activations.get(conversation);
          if (active?.procedures?.length) {
            grant.lastTasks.set(conversation, {
              slot: safeSlot(input.slot),
              taskDigest: createHash("sha256").update(String(input.content || "")).digest("hex"),
              procedureIds: active.procedures.map((procedure) => procedure.id),
              provider: "browser",
              model: site,
            });
          }
          const agentmon = await readAgentmonStatus(rootDir, engineRoot, safeSlot(input.slot));
          return sendJson(response, 200, { format: "agentmon.browser-ingest/v1", changed: result.changed, action: result.action, agentmon, privacy: { retention: "derived-only", rawPromptsStored: false, rawPromptsSentToAgentmonCloud: false } }, origin);
        }
        return sendJson(response, 404, { error: "Browser endpoint not found." }, origin);
      }

      if (!authorized(request, identity.token)) return sendJson(response, 401, { error: "Unauthorized." });
      if (await modelProviderRoutes.route({ request, response, url })) return;
      if (request.method === "POST" && url.pathname === "/v1/desktop/marketplace/pair") {
        const input = await readJson(request);
        return sendJson(response, 200, await marketplace.pair(input));
      }
      if (request.method === "GET" && url.pathname === "/v1/desktop/marketplace/status") {
        return sendJson(response, 200, await marketplace.status(safeSlot(url.searchParams.get("slot"))));
      }
      if (request.method === "POST" && url.pathname === "/v1/desktop/marketplace/attest") {
        const input = await readJson(request);
        return sendJson(response, 200, await marketplace.attest(safeSlot(input.slot)));
      }
      if (request.method === "POST" && url.pathname === "/v1/desktop/marketplace/list") {
        const input = await readJson(request);
        return sendJson(response, 200, await marketplace.createListing(safeSlot(input.slot), Number(input.expiresHours) || 72));
      }
      if (request.method === "POST" && url.pathname === "/v1/desktop/marketplace/cancel") {
        const input = await readJson(request);
        return sendJson(response, 200, await marketplace.cancelListing(safeSlot(input.slot)));
      }
      if (request.method === "GET" && url.pathname === "/v1/desktop/local-agent/discover") {
        const candidates = [
          { runtime: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
          { runtime: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" },
          { runtime: "vLLM", baseUrl: "http://127.0.0.1:8000/v1" },
          { runtime: "SGLang", baseUrl: "http://127.0.0.1:30000/v1" },
          { runtime: "LocalAI / llama.cpp", baseUrl: "http://127.0.0.1:8080/v1" },
          { runtime: "Jan", baseUrl: "http://127.0.0.1:1337/v1" },
          { runtime: "Text Generation WebUI", baseUrl: "http://127.0.0.1:5000/v1" },
        ];
        const runtimes = (await Promise.all(candidates.map(async (candidate) => {
          const provider = await localProvider({ ...localModelConfig, baseUrl: candidate.baseUrl, model: null }, 1_500);
          const status = await provider.status();
          return status.available ? { ...candidate, adapter: "openai-compatible", models: status.models || [] } : null;
        }))).filter(Boolean);
        return sendJson(response, 200, {
          format: "agentmon.local-agent-discovery/v1",
          runtimes,
          customEndpointSupported: true,
          privacy: { scannedHosts: ["127.0.0.1"], networkScope: "loopback-only" },
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/desktop/local-model/status") {
        const requestedBaseUrl = url.searchParams.get("baseUrl");
        const candidate = requestedBaseUrl ? { ...localModelConfig, baseUrl: requestedBaseUrl } : localModelConfig;
        const provider = await localProvider(candidate);
        const status = await provider.status();
        return sendJson(response, 200, {
          format: "agentmon.local-model-status/v1",
          configured: Boolean(localModelConfig.model),
          connected: status.available === true,
          baseUrl: provider.config.baseUrl,
          model: candidate.model,
          models: status.models || [],
          error: status.error || null,
          privacy: { transport: "loopback-only", credentialsStored: false },
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/desktop/local-model/connect") {
        const input = await readJson(request);
        const candidate = { format: "agentmon.local-model/v1", baseUrl: String(input.baseUrl || ""), model: String(input.model || "").trim() };
        if (!candidate.model || candidate.model.length > 128) throw new Error("Choose a valid local model.");
        const provider = await localProvider(candidate);
        const status = await provider.status();
        if (!status.available) throw new Error(`Local model server is ${status.error || `unavailable (${status.status || "no response"})`}.`);
        if (status.models?.length && !status.models.includes(candidate.model)) throw new Error("The selected model is not loaded by this local server.");
        localModelConfig = { ...candidate, baseUrl: provider.config.baseUrl };
        await saveLocalModelConfig(localModelConfig);
        return sendJson(response, 200, {
          format: "agentmon.local-model-connection/v1",
          connected: true,
          baseUrl: localModelConfig.baseUrl,
          model: localModelConfig.model,
          models: status.models || [],
          privacy: { transport: "loopback-only", credentialsStored: false, rawPromptsStoredByAgentmon: false },
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/desktop/local-model/chat") {
        const input = await readJson(request);
        return sendJson(response, 200, await modelProviderRoutes.performDesktopChat({ ...input, provider: "local" }, "local"));
      }
      if (request.method === "GET" && url.pathname === "/v1/desktop/status") {
        const slot = safeSlot(url.searchParams.get("slot"));
        const browser = [...browserTokens.values()][0] || null;
        const state = await readAgentmonStatus(rootDir, engineRoot, slot);
        const { usefulnessReport } = await loadV4(engineRoot);
        let effectiveness = usefulnessReport({});
        let actionLearning = null;
        try {
          const fullState = JSON.parse(await readFile(resolve(rootDir, ".agentmon/roster", slot, "agentmon.json"), "utf8"));
          effectiveness = usefulnessReport(fullState);
        } catch {}
        try {
          const { readActionLearningStatus } = await loadActions(engineRoot);
          actionLearning = await readActionLearningStatus({ rootDir, slot });
        } catch {}
        return sendJson(response, 200, {
          format: "agentmon.desktop-status/v1",
          slot,
          browser: {
            paired: Boolean(browser),
            origin: browser?.origin || null,
            pairedAt: browser?.pairedAt || null,
            site: browser?.site || null,
            siteEnabled: browser?.siteEnabled === true,
            lastSeenAt: browser?.lastSeenAt || null,
            lastPromptAt: browser?.lastPromptAt || null,
            promptCount: browser?.promptCount || 0,
            sites: browser ? [...browser.sites.values()] : [],
            activeAgentmon: browser ? [...browser.activations.values()][0]?.agentmon ?? null : null,
          },
          intake: {
            observed: "submitted-user-prompts-only",
            processing: "memory-only",
            retained: ["derived promptprint dimensions", "evidence digests", "skill and loop hypotheses"],
            excluded: ["drafts", "model responses", "raw prompt text", "credentials"],
          },
          actionIntake: {
            observed: "finite-semantic-events-only-when-separately-enabled",
            retained: ["site hostname", "route digest", "page class", "action taxonomy", "trainer-declared temporary battle state"],
            excluded: ["page text", "field values", "selectors", "paths", "URLs", "screenshots", "keystrokes", "inferred emotions"],
          },
          effectiveness,
          actionLearning,
          localModel: { configured: Boolean(localModelConfig.model), baseUrl: localModelConfig.baseUrl, model: localModelConfig.model },
          modelProvider: modelProviderConfig,
          privacy: { retention: "derived-only-browser", rawBrowserPromptsStored: false },
        });
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
    host,
    port: server.address().port,
    rootDir,
    pairingCode,
    token: identity.token,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}
