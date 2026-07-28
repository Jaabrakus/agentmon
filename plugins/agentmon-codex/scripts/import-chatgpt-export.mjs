#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingestAdapterBatch } from "../lib/adapters/native-client.mjs";

function messageText(message) {
  const content = message?.content;
  if (typeof content?.text === "string") return content.text;
  if (!Array.isArray(content?.parts)) return "";
  return content.parts.filter((part) => typeof part === "string").join("\n\n");
}

export function chatGptExportBatches(input) {
  if (!Array.isArray(input)) throw new Error("Expected the extracted ChatGPT conversations.json array.");
  const batches = [];
  for (const [conversationIndex, conversation] of input.entries()) {
    const events = [];
    for (const [nodeId, node] of Object.entries(conversation.mapping || {})) {
      if (node?.message?.author?.role !== "user") continue;
      const content = messageText(node.message);
      if (!content.trim()) continue;
      events.push({ id: String(nodeId || `message-${events.length + 1}`), role: "user", content, createdAt: node.message.create_time ? new Date(node.message.create_time * 1000).toISOString() : null });
    }
    if (!events.length) continue;
    batches.push({
      format: "agentmon.adapter-batch/v1",
      adapter: "chatgpt-export",
      mode: "snapshot",
      conversation: { id: String(conversation.id || conversation.conversation_id || `conversation-${conversationIndex + 1}`), label: String(conversation.title || "ChatGPT conversation").slice(0, 200) },
      consent: { scope: "user_prompts_only", grantedAt: new Date().toISOString() },
      events,
    });
  }
  return batches;
}

export async function importChatGptExport(options) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const input = JSON.parse(await readFile(resolve(options.file), "utf8"));
  const batches = chatGptExportBatches(input);
  let accepted = 0;
  for (const batch of batches) {
    const result = await (options.ingest ?? ingestAdapterBatch)({ rootDir, slot: options.slot || "main", batch });
    accepted += result.accepted?.prompts ?? batch.events.length;
  }
  return { conversations: batches.length, accepted, storage: "encrypted-local-vault" };
}

function parseArgs(argv) {
  const options = { rootDir: process.cwd(), slot: "main", file: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--file") options.file = argv[++index];
    else if (argv[index] === "--cwd") options.rootDir = resolve(argv[++index]);
    else if (argv[index] === "--slot") options.slot = argv[++index];
    else throw new Error(`Unknown import option: ${argv[index]}`);
  }
  if (!options.file) throw new Error("Pass --file with the extracted ChatGPT conversations.json path.");
  return options;
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  importChatGptExport(parseArgs(process.argv.slice(2))).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
