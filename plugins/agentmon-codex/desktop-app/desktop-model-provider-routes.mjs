import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function createDesktopModelProviderRoutes(options) {
  const { rootDir, engineRoot, readJson, sendJson, safeSlot, safeConversation, createAutomaticDownlink, loadV4, localProvider, getLocalModelConfig, setLocalModelConfig, getModelProviderConfig, saveModelProviderConfig } = options;
  const desktopOutcomeTasks = new Map();

  async function cloudProvider(config, timeoutMs = 60_000) {
    const { createCloudModelProvider } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/model-provider-registry.mjs")).href);
    return createCloudModelProvider({ ...config, timeoutMs });
  }

  function safeProvider(value) {
    const provider = String(value || getModelProviderConfig().provider || "local").trim().toLowerCase();
    if (!new Set(["local", "openai", "gemini", "venice"]).has(provider)) throw new Error("Unsupported model provider.");
    return provider;
  }

  function outcomeModel(value) {
    return String(value || "unknown-model").replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 128) || "unknown-model";
  }

  async function performDesktopChat(input, forcedProvider = null) {
    const providerId = safeProvider(forcedProvider || input.provider);
    const localConfig = getLocalModelConfig();
    const configured = forcedProvider === "local" ? { provider: "local", model: localConfig.model, baseUrl: localConfig.baseUrl } : getModelProviderConfig();
    if (configured.provider !== providerId || !configured.model) throw new Error("Connect the selected model provider first.");
    const prompt = String(input.prompt || "").trim();
    if (!prompt || prompt.length > 20_000) throw new Error("Chat prompts must contain 1-20,000 characters.");
    const slot = safeSlot(input.slot);
    const conversation = safeConversation(input.conversation);
    const agentmonMode = input.agentmonMode !== false;
    const downlink = agentmonMode ? await createAutomaticDownlink(rootDir, engineRoot, slot, prompt) : null;
    const system = agentmonMode
      ? downlink?.packet || "No proven Agentmon procedure matched this request. Answer normally without claiming access to private memories, external tools, or hidden data."
      : "You are a helpful assistant. Answer the user directly without claiming access to Agentmon identity, skills, private memories, external tools, or hidden data.";
    const provider = providerId === "local"
      ? await localProvider({ format: "agentmon.local-model/v1", baseUrl: configured.baseUrl, model: configured.model }, 120_000)
      : await cloudProvider({ provider: providerId, model: configured.model, apiKey: input.apiKey }, 120_000);
    const result = await provider.chat({ prompt, system, history: input.history, maxOutputTokens: input.maxOutputTokens });
    const [{ createFeedFromAdapterBatch }, { processFeed }] = await Promise.all([
      import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/adapter-contract.mjs")).href),
      import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/scripts/agentmon.mjs")).href),
    ]);
    const batch = {
      format: "agentmon.adapter-batch/v1",
      adapter: "agentmon-desktop-chat",
      mode: "append",
      conversation: { id: conversation, label: "Agentmon desktop chat" },
      consent: { scope: "user_prompts_only", grantedAt: new Date().toISOString() },
      events: [{ id: `desktop-${randomBytes(8).toString("hex")}`, role: "user", content: prompt }],
    };
    const training = await processFeed(createFeedFromAdapterBatch(batch), { rootDir, slot, retention: "derived-only", provider: providerId, model: result.model });
    let feedback = { eligible: false, token: null, reason: agentmonMode ? "No proven procedure matched this task." : "Generic mode has no Agentmon procedure to evaluate." };
    if (downlink?.procedures?.length) {
      const cutoff = Date.now() - 86_400_000;
      for (const [existingToken, task] of desktopOutcomeTasks) if (task.createdAt < cutoff) desktopOutcomeTasks.delete(existingToken);
      while (desktopOutcomeTasks.size >= 100) desktopOutcomeTasks.delete(desktopOutcomeTasks.keys().next().value);
      const token = randomBytes(24).toString("base64url");
      desktopOutcomeTasks.set(token, {
        slot,
        conversation,
        taskDigest: downlink.queryDigest || createHash("sha256").update(prompt).digest("hex"),
        procedureIds: downlink.procedures.map((procedure) => procedure.id),
        provider: providerId,
        model: outcomeModel(result.model),
        createdAt: Date.now(),
      });
      feedback = { eligible: true, token, reason: null };
    }
    const transport = providerId === "local" ? "loopback-only" : "direct-to-selected-cloud-provider";
    return {
      format: "agentmon.provider-chat/v1",
      answer: result.content,
      provider: providerId,
      model: result.model,
      mode: agentmonMode ? "agentmon" : "generic",
      agentmon: downlink ? { id: downlink.agentmon.id, name: downlink.agentmon.name, procedures: downlink.procedures.map((procedure) => ({ id: procedure.id, name: procedure.name })) } : null,
      receipt: downlink ? {
        identity: downlink.identity,
        procedures: downlink.procedures.map((procedure) => ({ id: procedure.id, name: procedure.name, executionMode: procedure.executionMode })),
        queryDigest: downlink.queryDigest,
        routing: downlink.routing,
        delivery: { status: providerId === "local" ? "answered-by-local-model" : "answered-by-cloud-provider", provider: providerId, model: result.model },
      } : { identity: null, procedures: [], queryDigest: createHash("sha256").update(prompt).digest("hex"), delivery: { status: "generic-model", provider: providerId, model: result.model } },
      feedback,
      training: { changed: training.changed, action: training.action, retention: "derived-only" },
      privacy: { transport, selectedProviderReceivesPrompt: true, agentmonCloudReceivesPrompt: false, rawPromptStoredByAgentmon: false, rawResponseStoredByAgentmon: false, rawHistoryStoredByAgentmon: false, providerRetentionControlledByAgentmon: false },
    };
  }

  async function route({ request, response, url }) {
    if (request.method === "GET" && url.pathname === "/v1/desktop/model-providers") {
      const { cloudProviderCatalog } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/model-provider-registry.mjs")).href);
      sendJson(response, 200, {
        format: "agentmon.model-provider-catalog/v1",
        providers: [{ id: "local", name: "Local runtime", credentialLabel: null, privacy: "device-only", credentials: "none" }, ...cloudProviderCatalog()],
        active: getModelProviderConfig(),
        privacy: { cloudProvidersDisabledUntilConfigured: true, credentialsAcceptedForCurrentRequestOnly: true, credentialsPersistedByCompanion: false },
      });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/model-provider/models") {
      const input = await readJson(request);
      const providerId = safeProvider(input.provider);
      if (providerId === "local") {
        const localConfig = getLocalModelConfig();
        const provider = await localProvider({ ...localConfig, baseUrl: String(input.baseUrl || localConfig.baseUrl), model: null }, 8_000);
        const status = await provider.status();
        if (!status.available) throw new Error(`Local model server is ${status.error || "unavailable"}.`);
        sendJson(response, 200, { format: "agentmon.model-list/v1", provider: "local", models: status.models || [], transport: "loopback-only" });
      } else {
        const provider = await cloudProvider({ provider: providerId, apiKey: input.apiKey }, 15_000);
        const status = await provider.status();
        if (!status.available) throw new Error(status.error || "The cloud provider is unavailable.");
        sendJson(response, 200, { format: "agentmon.model-list/v1", provider: providerId, models: status.models || [], transport: "direct-to-selected-cloud-provider" });
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/model-provider/connect") {
      const input = await readJson(request);
      const providerId = safeProvider(input.provider);
      const model = String(input.model || "").trim();
      if (!model || model.length > 160) throw new Error("Choose a valid model.");
      if (providerId === "local") {
        const candidate = { format: "agentmon.local-model/v1", baseUrl: String(input.baseUrl || ""), model };
        const provider = await localProvider(candidate, 8_000);
        const status = await provider.status();
        if (!status.available) throw new Error(`Local model server is ${status.error || `unavailable (${status.status || "no response"})`}.`);
        if (status.models?.length && !status.models.includes(model)) throw new Error("The selected model is not loaded by this local server.");
        const localConfig = { ...candidate, baseUrl: provider.config.baseUrl };
        await setLocalModelConfig(localConfig);
        await saveModelProviderConfig({ provider: "local", model, baseUrl: localConfig.baseUrl });
        sendJson(response, 200, { format: "agentmon.model-provider-connection/v1", connected: true, provider: "local", model, models: status.models || [], privacy: { transport: "loopback-only", credentialsStoredByCompanion: false } });
      } else {
        const provider = await cloudProvider({ provider: providerId, model, apiKey: input.apiKey }, 15_000);
        const status = await provider.status();
        if (!status.available) throw new Error(status.error || "The cloud provider is unavailable.");
        if (status.models?.length && !status.models.includes(model)) throw new Error("The selected model is not available to this provider account.");
        await saveModelProviderConfig({ provider: providerId, model });
        sendJson(response, 200, { format: "agentmon.model-provider-connection/v1", connected: true, provider: providerId, model, models: status.models || [], privacy: { transport: "direct-to-selected-cloud-provider", credentialsStoredByCompanion: false, agentmonCloudReceivesPrompts: false } });
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/model-provider/chat") {
      sendJson(response, 200, await performDesktopChat(await readJson(request)));
      return true;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/model-provider/outcome") {
      const input = await readJson(request);
      const token = String(input.token || "");
      const task = desktopOutcomeTasks.get(token);
      if (!task) throw new Error("This response feedback is unavailable or was already recorded.");
      const feedback = String(input.feedback || "").trim().toLowerCase();
      const mapping = {
        helped: { outcome: "success", rating: "helped", retryCount: 0, correctionLevel: "none" },
        missed: { outcome: "failure", rating: "missed", retryCount: 0, correctionLevel: "major" },
        retry: { outcome: "unknown", rating: "neutral", retryCount: 1, correctionLevel: "minor" },
      }[feedback];
      if (!mapping) throw new Error("Feedback must be helped, missed, or retry.");
      const { recordOutcomeFeedback } = await loadV4(engineRoot);
      const result = await recordOutcomeFeedback({ rootDir, ...task, ...mapping });
      desktopOutcomeTasks.delete(token);
      sendJson(response, 200, { format: "agentmon.desktop-outcome/v1", recorded: true, feedback, score: result.effectiveness.averageScore, totalOutcomes: result.effectiveness.totalOutcomes, privacy: { rawPromptsStored: false, rawResponsesStored: false, feedbackTextStored: false, proofEligible: false } });
      return true;
    }
    return false;
  }

  return { route, performDesktopChat };
}
