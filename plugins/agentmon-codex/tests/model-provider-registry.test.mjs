import assert from "node:assert/strict";
import test from "node:test";
import { cloudProviderCatalog, createCloudModelProvider } from "../lib/model-provider-registry.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

test("provider catalog is descriptor-only and never contains credentials", () => {
  const catalog = cloudProviderCatalog();
  assert.deepEqual(catalog.map((item) => item.id), ["openai", "gemini", "venice"]);
  assert.doesNotMatch(JSON.stringify(catalog), /apiKey|secret|Bearer/);
});

test("OpenAI provider uses the Responses API without retaining its key", async () => {
  const requests = [];
  const provider = createCloudModelProvider({
    provider: "openai",
    model: "gpt-test",
    apiKey: "OPENAI-PRIVATE-KEY",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (String(url).endsWith("/models")) return jsonResponse({ data: [{ id: "gpt-test" }] });
      return jsonResponse({ model: "gpt-test", output_text: "OpenAI test answer" });
    },
  });
  assert.equal((await provider.status()).available, true);
  const result = await provider.chat({ system: "Agentmon identity", prompt: "Private prompt", history: [{ role: "system", content: "ignored" }, { role: "assistant", content: "Earlier" }] });
  assert.equal(result.content, "OpenAI test answer");
  assert.equal(requests[1].url, "https://api.openai.com/v1/responses");
  assert.equal(requests[1].init.headers.Authorization, "Bearer OPENAI-PRIVATE-KEY");
  const body = JSON.parse(requests[1].init.body);
  assert.equal(body.instructions, "Agentmon identity");
  assert.deepEqual(body.input.map((item) => item.role), ["assistant", "user"]);
  assert.doesNotMatch(JSON.stringify(provider.config), /OPENAI-PRIVATE-KEY/);
});

test("Gemini provider uses header authentication and maps assistant history to model", async () => {
  const requests = [];
  const provider = createCloudModelProvider({
    provider: "gemini",
    model: "gemini-test",
    apiKey: "GEMINI-PRIVATE-KEY",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (String(url).includes("/models?pageSize")) return jsonResponse({ models: [{ name: "models/gemini-test", supportedGenerationMethods: ["generateContent"] }] });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "Gemini test answer" }] } }] });
    },
  });
  assert.equal((await provider.status()).modelAvailable, true);
  const result = await provider.chat({ system: "Agentmon identity", prompt: "Private prompt", history: [{ role: "assistant", content: "Earlier" }] });
  assert.equal(result.content, "Gemini test answer");
  assert.match(requests[1].url, /gemini-test:generateContent$/);
  assert.equal(requests[1].init.headers["x-goog-api-key"], "GEMINI-PRIVATE-KEY");
  const body = JSON.parse(requests[1].init.body);
  assert.deepEqual(body.contents.map((item) => item.role), ["model", "user"]);
  assert.doesNotMatch(requests[1].url, /GEMINI-PRIVATE-KEY/);
});

test("Venice provider discovers text models and preserves the Agentmon system prompt", async () => {
  const requests = [];
  const provider = createCloudModelProvider({
    provider: "venice",
    model: "venice-test",
    apiKey: "VENICE-PRIVATE-KEY",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (String(url).includes("/models?type=text")) return jsonResponse({ data: [{ id: "venice-test", type: "text" }, { id: "image-test", type: "image" }] });
      return jsonResponse({ model: "venice-test", choices: [{ message: { content: "Venice test answer" } }] });
    },
  });
  const status = await provider.status();
  assert.deepEqual(status.models, ["venice-test"]);
  assert.equal(status.modelAvailable, true);
  const result = await provider.chat({ system: "Agentmon identity", prompt: "Private prompt", history: [{ role: "assistant", content: "Earlier" }] });
  assert.equal(result.content, "Venice test answer");
  assert.equal(requests[1].url, "https://api.venice.ai/api/v1/chat/completions");
  assert.equal(requests[1].init.headers.Authorization, "Bearer VENICE-PRIVATE-KEY");
  const body = JSON.parse(requests[1].init.body);
  assert.deepEqual(body.messages.map((item) => item.role), ["system", "assistant", "user"]);
  assert.equal(body.messages[0].content, "Agentmon identity");
  assert.deepEqual(body.venice_parameters, { include_venice_system_prompt: false });
  assert.doesNotMatch(JSON.stringify(provider.config), /VENICE-PRIVATE-KEY/);
});

test("provider registry rejects unknown providers and malformed credentials", () => {
  assert.throws(() => createCloudModelProvider({ provider: "unknown", apiKey: "valid-looking-key" }), /Unsupported/);
  assert.throws(() => createCloudModelProvider({ provider: "openai", apiKey: "bad key" }), /invalid/);
});
