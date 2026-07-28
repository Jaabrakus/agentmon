const VALID_INTENTS = new Set(["personal-preference", "directive", "product-spec", "brainstorm", "question", "reference"]);

export function assertLoopbackModelUrl(value) {
  const url = new URL(value || "http://127.0.0.1:11434/v1");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Local model URL must use HTTP or HTTPS.");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new Error("Local model providers must bind to loopback only.");
  if (url.username || url.password) throw new Error("Do not place model credentials in the local provider URL.");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function memoryOnlyHistory(value) {
  if (!Array.isArray(value)) return [];
  let totalCharacters = 0;
  const messages = [];
  for (const item of value.slice(-12)) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
    const content = String(item?.content || "").trim().slice(0, 8_000);
    if (!role || !content) continue;
    totalCharacters += content.length;
    if (totalCharacters > 40_000) break;
    messages.push({ role, content });
  }
  return messages;
}

export function localModelConfigFromEnv(environment = process.env) {
  return {
    kind: "openai-compatible-local",
    mode: "shadow",
    baseUrl: assertLoopbackModelUrl(environment.AGENTMON_LOCAL_MODEL_URL || "http://127.0.0.1:11434/v1").toString().replace(/\/$/, ""),
    model: String(environment.AGENTMON_LOCAL_MODEL || "").trim() || null,
    timeoutMs: Math.max(1_000, Math.min(120_000, Number(environment.AGENTMON_LOCAL_MODEL_TIMEOUT_MS) || 30_000)),
  };
}

export function createLocalModelProvider(config = localModelConfigFromEnv()) {
  const baseUrl = assertLoopbackModelUrl(config.baseUrl).toString().replace(/\/$/, "");
  const timeoutMs = config.timeoutMs || 30_000;
  return {
    config: { ...config, baseUrl, mode: "shadow" },
    async status() {
      try {
        const response = await fetchWithTimeout(`${baseUrl}/models`, { headers: { Accept: "application/json" } }, timeoutMs);
        if (!response.ok) return { available: false, status: response.status, model: config.model, mode: "shadow" };
        const payload = await response.json();
        const models = Array.isArray(payload.data) ? payload.data.map((item) => item.id).filter(Boolean) : [];
        return { available: true, status: response.status, model: config.model, models, mode: "shadow" };
      } catch (error) {
        return { available: false, status: null, model: config.model, mode: "shadow", error: error.name === "AbortError" ? "timeout" : "unreachable" };
      }
    },
    async chat(input = {}) {
      if (!config.model) throw new Error("Choose a local model before starting a private chat.");
      const prompt = String(input.prompt || "").trim();
      if (!prompt || prompt.length > 20_000) throw new Error("Local chat prompts must contain 1-20,000 characters.");
      const system = String(input.system || "You are a helpful local assistant.").trim().slice(0, 12_000);
      const history = memoryOnlyHistory(input.history);
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: Math.max(64, Math.min(4_096, Number(input.maxOutputTokens) || 1_200)),
          messages: [
            { role: "system", content: system },
            ...history,
            { role: "user", content: prompt },
          ],
        }),
      }, timeoutMs);
      if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}.`);
      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("Local model response did not include message content.");
      return { content: content.trim(), model: config.model, baseUrl, privacy: { promptStoredByAgentmon: false, responseStoredByAgentmon: false, historyStoredByAgentmon: false, networkScope: "loopback-only" } };
    },
    async classify(prompts) {
      if (!config.model) throw new Error("Set AGENTMON_LOCAL_MODEL before requesting local suggestions.");
      const limited = prompts.slice(0, 50).map((prompt) => ({ id: String(prompt.id), text: String(prompt.text || "") }));
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are Agentmon's local intent calibration assistant. Classify only the supplied user-authored prompts. Return strict JSON as {classifications:[{id,intent,confidence}]}. Allowed intents: personal-preference, directive, product-spec, brainstorm, question, reference. Do not diagnose personality, infer hidden reasoning, quote prompt text, or propose skills." },
            { role: "user", content: JSON.stringify({ prompts: limited }) },
          ],
        }),
      }, timeoutMs);
      if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}.`);
      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Local model response did not include message content.");
      const parsed = JSON.parse(content);
      const allowedIds = new Set(limited.map((prompt) => prompt.id));
      return (parsed.classifications || []).flatMap((item) => {
        if (!allowedIds.has(String(item.id)) || !VALID_INTENTS.has(item.intent)) return [];
        return [{ sourceId: String(item.id), intent: item.intent, confidence: Math.max(0, Math.min(100, Math.round(Number(item.confidence) || 0))), model: config.model, mode: "shadow" }];
      });
    },
    async proposeProcedures(evidencePacket) {
      if (!config.model) throw new Error("Set AGENTMON_LOCAL_MODEL before requesting local suggestions.");
      if (evidencePacket?.privacy?.rawPromptsIncluded !== false) throw new Error("Semantic induction accepts only a raw-free evidence packet.");
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are Agentmon's shadow procedure selector. You receive raw-free behavioral counts, never prompts. Return strict JSON as {suggestions:[{id,name,triggerKind,skills,steps,completion}]}. Select only values listed in the evidence packet. Do not write procedure instructions, infer personality, or invent permissions." },
            { role: "user", content: JSON.stringify(evidencePacket) },
          ],
        }),
      }, timeoutMs);
      if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}.`);
      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Local model response did not include message content.");
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.suggestions)) throw new Error("Local model did not return procedure suggestions.");
      return parsed.suggestions.slice(0, 4);
    },
  };
}
