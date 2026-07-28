import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the companion monitor is serialized, visibility-aware, and low-frequency", async () => {
  const source = await readFile(resolve(root, "ui/app.js"), "utf8");
  assert.match(source, /companionRequestInFlight/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /scheduleCompanionPoll\(delay = 5000\)/);
  assert.doesNotMatch(source, /setInterval\(pollCompanion/);
  assert.doesNotMatch(source, /setTimeout\(loadCodexPluginStatus/);
});

test("native subprocesses cannot block the macOS UI thread indefinitely", async () => {
  const source = await readFile(resolve(root, "src-tauri/src/main.rs"), "utf8");
  assert.match(source, /spawn_blocking/);
  assert.match(source, /command_output_with_timeout/);
  assert.match(source, /Codex setup timed out|\{label\} timed out/);
  assert.match(source, /async fn install_codex_plugin/);
  assert.match(source, /async fn companion_status/);
  assert.match(source, /async fn local_model_discover/);
  assert.match(source, /async fn local_model_connect/);
  assert.match(source, /async fn local_model_chat/);
  assert.match(source, /async fn model_provider_chat/);
  assert.match(source, /async fn model_provider_outcome/);
  assert.match(source, /"venice" => Ok\(Some\("venice"\)\)/);
  assert.match(source, /PROVIDER_KEYCHAIN_SERVICE/);
  assert.match(source, /Duration::from_secs\(120\)/);
});

test("the native chat UI uses the authenticated local gateway instead of copying a system prompt", async () => {
  const source = await readFile(resolve(root, "ui/app.js"), "utf8");
  const markup = await readFile(resolve(root, "ui/index.html"), "utf8");
  assert.match(source, /invoke\("model_provider_chat"/);
  assert.match(source, /invoke\("model_provider_outcome"/);
  assert.match(source, /invoke\("model_provider_secret_set"/);
  assert.match(markup, /<option value="venice">VENICE · CLOUD<\/option>/);
  assert.match(source, /agentmonMode/);
  assert.match(source, /localChatHistory\.slice\(-12\)/);
  assert.doesNotMatch(source, /system:\s*engineState/);
  assert.match(markup, /AGENTMON MODE · ON/);
  assert.match(markup, /Conversation memory only/);
  assert.match(markup, /OPENAI · CLOUD/);
  assert.match(markup, /GEMINI · CLOUD/);
});
