import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFeedFromAdapterBatch, validateAdapterBatch } from "../lib/adapter-contract.mjs";
import { assertLoopbackModelUrl, createLocalModelProvider } from "../lib/local-model-provider.mjs";
import { startAgentmonDaemon } from "../scripts/agentmon-daemon.mjs";
import { createLocalVault, VAULT_FORMAT } from "../lib/privacy/local-vault.mjs";
import { ingestHookPayload } from "../scripts/universal-hook-adapter.mjs";
import { chatGptExportBatches } from "../scripts/import-chatgpt-export.mjs";
import { startCompanion } from "../scripts/agentmon-companion.mjs";
import { migrateFeedToVault } from "../scripts/migrate-feed-to-vault.mjs";

function batch(events, mode = "snapshot") {
  return {
    format: "agentmon.adapter-batch/v1",
    adapter: "test-ide",
    mode,
    conversation: { id: "conversation-1", label: "Test IDE" },
    consent: { scope: "user_prompts_only", grantedAt: "2026-01-01T00:00:00.000Z" },
    events: events.map((content, index) => ({ id: `event-${index + 1}`, role: "user", content })),
  };
}

async function readArtifactBytes(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(...await readArtifactBytes(path));
    else if (entry.isFile()) chunks.push(await readFile(path));
  }
  return chunks;
}

test("normalizes provider-neutral adapter events into a sanitized local feed", () => {
  const first = createFeedFromAdapterBatch(batch(["Build the parser with api_key=1234567890abcdef"]));
  assert.equal(first.source, "adapter:test-ide");
  assert.equal(first.prompts.length, 1);
  assert.doesNotMatch(first.prompts[0].text, /1234567890abcdef/);
  assert.equal(first.totals.redactions, 1);

  const appended = createFeedFromAdapterBatch(batch(["Run tests and verify the implementation."], "append"), first);
  assert.equal(appended.prompts.length, 1);
  assert.notEqual(appended.revision, first.revision);

  const invalid = batch(["Assistant output"]);
  invalid.events[0].role = "assistant";
  assert.throws(() => validateAdapterBatch(invalid), /not user-authored/);
});

test("keeps local model providers on loopback and treats their output as shadow suggestions", async () => {
  assert.throws(() => assertLoopbackModelUrl("https://models.example.com/v1"), /loopback only/);
  const localChatRequests = [];
  const mock = createServer(async (request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "agentmon-local" }] }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input.response_format) {
      localChatRequests.push(input);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "Private local answer" } }] }));
      return;
    }
    const requestPayload = JSON.parse(input.messages[1].content);
    response.writeHead(200, { "Content-Type": "application/json" });
    const result = requestPayload.prompts
      ? { classifications: requestPayload.prompts.map((prompt) => ({ id: prompt.id, intent: "directive", confidence: 91 })) }
      : { suggestions: [{ id: "local-proof-loop", name: "Local Proof Loop", triggerKind: "implementation", skills: ["code"], steps: ["inspect", "verify"], completion: ["verified"] }] };
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise((resolvePromise) => mock.listen(0, "127.0.0.1", resolvePromise));
  try {
    const port = mock.address().port;
    const provider = createLocalModelProvider({ baseUrl: `http://127.0.0.1:${port}/v1`, model: "agentmon-local", timeoutMs: 2_000 });
    assert.equal((await provider.status()).available, true);
    const suggestions = await provider.classify([{ id: "source-1", text: "Build and test the feature." }]);
    assert.deepEqual(suggestions, [{ sourceId: "source-1", intent: "directive", confidence: 91, model: "agentmon-local", mode: "shadow" }]);
    const chat = await provider.chat({ prompt: "LOCAL-CHAT-PRIVATE-SENTINEL", system: "Use verified Agentmon guidance.", history: [{ role: "user", content: "Earlier memory-only turn" }, { role: "system", content: "must be ignored" }] });
    assert.equal(chat.content, "Private local answer");
    assert.deepEqual(chat.privacy, { promptStoredByAgentmon: false, responseStoredByAgentmon: false, historyStoredByAgentmon: false, networkScope: "loopback-only" });
    assert.deepEqual(localChatRequests[0].messages.map((message) => message.role), ["system", "user", "user"]);
    assert.equal(localChatRequests[0].messages[1].content, "Earlier memory-only turn");
    assert.doesNotMatch(JSON.stringify(localChatRequests[0]), /must be ignored/);
    const procedures = await provider.proposeProcedures({ format: "agentmon.semantic-evidence/v1", privacy: { rawPromptsIncluded: false } });
    assert.equal(procedures[0].id, "local-proof-loop");
    await assert.rejects(() => provider.proposeProcedures({ privacy: { rawPromptsIncluded: true }, prompt: "private" }), /raw-free evidence/);
  } finally {
    await new Promise((resolvePromise) => mock.close(resolvePromise));
  }
});

test("runs an authenticated loopback daemon for non-Codex adapters", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-daemon-"));
  const daemon = await startAgentmonDaemon({
    rootDir,
    port: 0,
    vaultOptions: { key: Buffer.alloc(32, 7) },
    localModelConfig: { baseUrl: "http://127.0.0.1:9/v1", model: null, timeoutMs: 1_000 },
  });
  const endpoint = `http://127.0.0.1:${daemon.port}`;
  const authorization = { Authorization: `Bearer ${daemon.token}` };
  try {
    assert.equal((await fetch(`${endpoint}/v1/health`)).status, 401);
    assert.equal((await fetch(`${endpoint}/v1/health`, { headers: { ...authorization, Origin: "https://malicious.example" } })).status, 403);
    const health = await (await fetch(`${endpoint}/v1/health`, { headers: authorization })).json();
    assert.equal(health.binding, "loopback-only");
    assert.equal(health.rawFeedStorage, "aes-256-gcm-encrypted");

    const privatePhrase = "Build my indigo astrolabe parser with tools and tests.";
    const response = await fetch(`${endpoint}/v1/ingest`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ slot: "ide", agent: { name: "Local Trainer", role: "builder", rootDir: join(rootDir, "escape") }, batch: batch([
        privatePhrase,
        "Implement the code and run the test suite.",
        "Debug the patch with terminal tools.",
        "Verify the result before shipping.",
      ]) }),
    });
    assert.equal(response.status, 200);
    const resultText = await response.text();
    assert.doesNotMatch(resultText, /indigo astrolabe/i);
    const profile = await (await fetch(`${endpoint}/v1/agentmons/ide`, { headers: authorization })).json();
    assert.equal(profile.privacy.rawPromptsIncluded, false);
    assert.equal("observations" in profile, false);
    const routePhrase = "ROUTE-PRIVATE-TEXT-991";
    const route = await (await fetch(`${endpoint}/v1/route`, { method: "POST", headers: { ...authorization, "Content-Type": "application/json" }, body: JSON.stringify({ query: `Implement ${routePhrase} and verify it`, allowedPermissions: ["read-files", "write-files", "run-tools"] }) })).json();
    assert.equal(route.privacy.rawQueryStored, false);
    assert.doesNotMatch(JSON.stringify(route), new RegExp(routePhrase));
    const tokenMode = (await import("node:fs/promises")).stat(daemon.tokenPath);
    assert.equal((await tokenMode).mode & 0o077, 0);
    assert.doesNotMatch(await readFile(join(rootDir, ".agentmon/roster/ide/learning-ledger.json"), "utf8"), /indigo astrolabe/i);
    const encryptedFeed = await readFile(join(rootDir, ".agentmon/vault/feeds/ide.enc.json"), "utf8");
    assert.doesNotMatch(encryptedFeed, /indigo astrolabe/i);
    assert.equal(JSON.parse(encryptedFeed).format, VAULT_FORMAT);
    await assert.rejects(() => readFile(join(rootDir, "escape/.agentmon/roster/ide/agentmon.json")), /ENOENT/);
  } finally {
    await daemon.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pairs an extension once and persists only raw-free browser-derived learning", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-browser-"));
  const browserPairingCode = "PAIR-AGENTMON-ONCE";
  const origin = "chrome-extension://abcdefghijklmnop";
  const daemon = await startAgentmonDaemon({
    rootDir,
    port: 0,
    browserPairingCode,
    vaultOptions: { key: Buffer.alloc(32, 6) },
    localModelConfig: { baseUrl: "http://127.0.0.1:9/v1", model: null, timeoutMs: 1_000 },
  });
  const endpoint = `http://127.0.0.1:${daemon.port}`;
  try {
    const pairResponse = await fetch(`${endpoint}/v1/browser/pair`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ code: browserPairingCode }),
    });
    assert.equal(pairResponse.status, 200);
    assert.equal(pairResponse.headers.get("access-control-allow-origin"), origin);
    const pair = await pairResponse.json();
    assert.equal(pair.retention, "derived-only");
    assert.equal((await fetch(`${endpoint}/v1/browser/pair`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ code: browserPairingCode }) })).status, 401);

    const headers = { Origin: origin, Authorization: `Bearer ${pair.token}`, "Content-Type": "application/json" };
    const privatePhrase = "QUARTZ-MANTIS-PRIVATE-PROMPT-7781";
    const prompts = [
      `Build ${privatePhrase} with a modular parser and command tools.`,
      "Implement the next component and run focused tests.",
      "Debug the adapter, inspect failures, and verify the fix.",
      "Ship only after checking privacy boundaries and test results.",
    ];
    for (const [index, content] of prompts.entries()) {
      const response = await fetch(`${endpoint}/v1/browser/ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ site: "chatgpt.com", conversation: "private-chat", eventId: `browser-${index}`, content }),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.privacy.retention, "derived-only");
      assert.equal(result.privacy.rawPromptsStored, false);
    }

    const status = await (await fetch(`${endpoint}/v1/browser/status`, { headers })).json();
    assert.equal(status.rawPromptsStored, false);
    assert.equal((await fetch(`${endpoint}/v1/agentmons/main`, { headers })).status, 403);
    await assert.rejects(() => readFile(join(rootDir, ".agentmon/vault/feeds/main.enc.json")), /ENOENT/);
    const artifacts = Buffer.concat(await readArtifactBytes(join(rootDir, ".agentmon"))).toString("utf8");
    assert.doesNotMatch(artifacts, /QUARTZ-MANTIS-PRIVATE-PROMPT-7781/);
    const state = JSON.parse(await readFile(join(rootDir, ".agentmon/roster/main/agentmon.json"), "utf8"));
    assert.equal(state.observations.length, 4);
    assert.equal(state.sourceCount, 4);
    assert.equal(state.skillPackages.length, 0);
  } finally {
    await daemon.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("encrypts authenticated local feed records and rejects the wrong key", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-vault-"));
  try {
    const first = createLocalVault(rootDir, { key: Buffer.alloc(32, 3) });
    await first.writeJson("feeds/main", { privatePrompt: "private dragon strategy" });
    const ciphertext = await readFile(join(rootDir, ".agentmon/vault/feeds/main.enc.json"), "utf8");
    assert.doesNotMatch(ciphertext, /private dragon strategy/);
    assert.deepEqual(await first.readJson("feeds/main"), { privatePrompt: "private dragon strategy" });
    const wrong = createLocalVault(rootDir, { key: Buffer.alloc(32, 4) });
    await assert.rejects(() => wrong.readJson("feeds/main"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("normalizes Kimi and Antigravity hooks without collecting assistant text", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-hooks-"));
  const captured = [];
  const ingest = async (input) => { captured.push(input); return { changed: true }; };
  try {
    await ingestHookPayload({ hook_event_name: "UserPromptSubmit", session_id: "kimi-1", cwd: rootDir, prompt: "Design the encrypted vault." }, { provider: "kimi", slot: "main", ingest });
    const transcriptPath = join(rootDir, "transcript.jsonl");
    await writeFile(transcriptPath, `${JSON.stringify({ role: "user", content: "Build the adapter." })}\n${JSON.stringify({ role: "assistant", content: "I will build it." })}\n`);
    await ingestHookPayload({ conversationId: "agy-1", workspacePaths: [rootDir], transcriptPath }, { provider: "antigravity", slot: "main", ingest });
    assert.equal(captured[0].batch.events[0].content, "Design the encrypted vault.");
    assert.deepEqual(captured[1].batch.events.map((event) => event.content), ["Build the adapter."]);
    assert.equal(JSON.stringify(captured).includes("I will build it"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("imports only user-authored messages from a ChatGPT export", () => {
  const batches = chatGptExportBatches([{ id: "chat-1", title: "Agentmon", mapping: {
    user: { message: { author: { role: "user" }, content: { parts: ["Build my private companion."] }, create_time: 1_700_000_000 } },
    assistant: { message: { author: { role: "assistant" }, content: { parts: ["Hidden assistant response"] } } },
    system: { message: { author: { role: "system" }, content: { parts: ["Hidden system prompt"] } } },
  } }]);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].events.map((event) => event.content), ["Build my private companion."]);
  assert.equal(JSON.stringify(batches).includes("Hidden"), false);
});

test("turns on a private companion with an unbound signal before the first prompt", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-companion-"));
  const companion = await startCompanion({ rootDir, port: 0, vaultOptions: { key: Buffer.alloc(32, 8) }, localModelConfig: { baseUrl: "http://127.0.0.1:9/v1", model: null } });
  try {
    assert.equal(companion.status.state, "signal");
    assert.equal(companion.status.signalBrightness, 8);
    assert.equal(companion.status.visualPath, null);
    assert.equal(companion.status.rawPromptsLeaveDevice, false);
  } finally {
    await companion.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("verifies legacy feed encryption before explicitly removing plaintext", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-migration-"));
  const source = join(rootDir, "legacy.json");
  const feed = createFeedFromAdapterBatch(batch(["Migrate this private prompt."]));
  await writeFile(source, JSON.stringify(feed));
  try {
    const result = await migrateFeedToVault({ rootDir, file: source, removePlaintext: true, vaultOptions: { key: Buffer.alloc(32, 9) } });
    assert.equal(result.plaintextRemoved, true);
    await assert.rejects(() => readFile(source), /ENOENT/);
    assert.doesNotMatch(await readFile(result.destination, "utf8"), /Migrate this private prompt/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
