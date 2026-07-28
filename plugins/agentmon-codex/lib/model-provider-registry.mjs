const CLOUD_PROVIDERS = Object.freeze({
  openai: {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    credentialLabel: "OpenAI API key",
    privacy: "cloud-provider",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    credentialLabel: "Gemini API key",
    privacy: "cloud-provider",
  },
  venice: {
    id: "venice",
    name: "Venice AI",
    endpoint: "https://api.venice.ai/api/v1",
    credentialLabel: "Venice API key",
    privacy: "cloud-provider",
  },
});

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 20_000;

function providerError(provider, status, payload) {
  const message = payload?.error?.message || payload?.message || `HTTP ${status}`;
  return new Error(`${CLOUD_PROVIDERS[provider].name} rejected the request: ${String(message).slice(0, 500)}`);
}

function normalizeKey(value) {
  const key = String(value || "").trim();
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) throw new Error("The provider API key is invalid.");
  return key;
}

function normalizeModel(value) {
  const model = String(value || "").trim().replace(/^models\//, "");
  if (!model || model.length > 160 || !/^[a-zA-Z0-9._:/-]+$/.test(model)) throw new Error("Choose a valid provider model.");
  return model;
}

function normalizeMessages(history, prompt) {
  const messages = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_MESSAGES)
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({ role: message.role, content: String(message.content || "").slice(0, MAX_MESSAGE_CHARS) }))
    .filter((message) => message.content.trim());
  messages.push({ role: "user", content: String(prompt || "").slice(0, MAX_MESSAGE_CHARS) });
  return messages;
}

async function readPayload(response) {
  const text = await response.text();
  try { return JSON.parse(text || "{}"); }
  catch { return { message: text.slice(0, 500) || `HTTP ${response.status}` }; }
}

async function openAiModels(apiKey, fetchImpl, timeoutMs) {
  const response = await fetchImpl(`${CLOUD_PROVIDERS.openai.endpoint}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw providerError("openai", response.status, payload);
  return [...new Set((payload.data || []).map((item) => String(item.id || "").trim()).filter(Boolean))].sort();
}

async function geminiModels(apiKey, fetchImpl, timeoutMs) {
  const response = await fetchImpl(`${CLOUD_PROVIDERS.gemini.endpoint}/models?pageSize=1000`, {
    headers: { "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw providerError("gemini", response.status, payload);
  return [...new Set((payload.models || [])
    .filter((item) => !Array.isArray(item.supportedGenerationMethods) || item.supportedGenerationMethods.includes("generateContent"))
    .map((item) => String(item.name || "").replace(/^models\//, "").trim())
    .filter(Boolean))].sort();
}

async function veniceModels(apiKey, fetchImpl, timeoutMs) {
  const response = await fetchImpl(`${CLOUD_PROVIDERS.venice.endpoint}/models?type=text`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw providerError("venice", response.status, payload);
  return [...new Set((payload.data || [])
    .filter((item) => !item.type || item.type === "text")
    .map((item) => String(item.id || "").trim())
    .filter(Boolean))].sort();
}

async function openAiChat({ apiKey, model, system, prompt, history, maxOutputTokens, fetchImpl, timeoutMs }) {
  const input = normalizeMessages(history, prompt).map((message) => ({ role: message.role, content: message.content }));
  const response = await fetchImpl(`${CLOUD_PROVIDERS.openai.endpoint}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: String(system || ""), input, max_output_tokens: Math.max(64, Math.min(8_000, Number(maxOutputTokens) || 1600)) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw providerError("openai", response.status, payload);
  const content = String(payload.output_text || "") || (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("\n");
  if (!content.trim()) throw new Error("OpenAI returned no text response.");
  return { content, model: String(payload.model || model) };
}

async function geminiChat({ apiKey, model, system, prompt, history, maxOutputTokens, fetchImpl, timeoutMs }) {
  const contents = normalizeMessages(history, prompt).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const response = await fetchImpl(`${CLOUD_PROVIDERS.gemini.endpoint}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: String(system || "") }] },
      contents,
      generationConfig: { maxOutputTokens: Math.max(64, Math.min(8_000, Number(maxOutputTokens) || 1600)) },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw providerError("gemini", response.status, payload);
  const content = (payload.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n");
  if (!content.trim()) throw new Error("Gemini returned no text response.");
  return { content, model };
}

async function veniceChat({ apiKey, model, system, prompt, history, maxOutputTokens, fetchImpl, timeoutMs }) {
  const messages = [
    { role: "system", content: String(system || "") },
    ...normalizeMessages(history, prompt),
  ].filter((message) => message.content.trim());
  const response = await fetchImpl(`${CLOUD_PROVIDERS.venice.endpoint}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: Math.max(64, Math.min(8_000, Number(maxOutputTokens) || 1600)),
      venice_parameters: { include_venice_system_prompt: false },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw providerError("venice", response.status, payload);
  const content = String(payload.choices?.[0]?.message?.content || "");
  if (!content.trim()) throw new Error("Venice returned no text response.");
  return { content, model: String(payload.model || model) };
}

export function cloudProviderCatalog() {
  return Object.values(CLOUD_PROVIDERS).map((provider) => ({ ...provider, credentials: "system-credential-vault", configured: false }));
}

export function createCloudModelProvider(options = {}) {
  const provider = String(options.provider || "").trim().toLowerCase();
  if (!CLOUD_PROVIDERS[provider]) throw new Error("Unsupported cloud model provider.");
  const apiKey = normalizeKey(options.apiKey);
  const model = options.model ? normalizeModel(options.model) : null;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(1_000, Math.min(180_000, Number(options.timeoutMs) || 60_000));
  const listModels = () => ({
    openai: openAiModels,
    gemini: geminiModels,
    venice: veniceModels,
  })[provider](apiKey, fetchImpl, timeoutMs);
  return {
    config: { provider, model, endpoint: CLOUD_PROVIDERS[provider].endpoint },
    async status() {
      try {
        const models = await listModels();
        return { available: true, models, modelAvailable: model ? models.includes(model) : null };
      } catch (error) {
        return { available: false, models: [], error: error.message };
      }
    },
    async chat(input = {}) {
      if (!model) throw new Error("Choose a model before chatting.");
      const chat = ({ openai: openAiChat, gemini: geminiChat, venice: veniceChat })[provider];
      return chat({ ...input, apiKey, model, fetchImpl, timeoutMs });
    },
  };
}
