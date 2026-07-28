#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestAdapterBatch } from "../lib/adapters/native-client.mjs";

function parseArgs(argv) {
  const options = { provider: null, slot: "main", endpoint: "http://127.0.0.1:4765/v1/ingest" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--provider") options.provider = argv[++index];
    else if (argv[index] === "--slot") options.slot = argv[++index];
    else if (argv[index] === "--endpoint") options.endpoint = argv[++index];
    else throw new Error(`Unknown hook option: ${argv[index]}`);
  }
  if (!["kimi", "antigravity"].includes(options.provider)) throw new Error("Hook provider must be kimi or antigravity.");
  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 20);
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((item) => typeof item === "string" || item?.type === "text").map((item) => typeof item === "string" ? item : item.text || "").join("\n");
}

function userTextsFromNode(node, output = []) {
  if (!node || typeof node !== "object") return output;
  const isUser = node.role === "user" || node.type === "userMessage" || node.author?.role === "user";
  if (isUser) {
    const text = textFromContent(node.content ?? node.message ?? node.text);
    if (text.trim()) output.push(text);
  }
  if (typeof node.userMessage === "string" && node.userMessage.trim()) output.push(node.userMessage);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") userTextsFromNode(value, output);
  }
  return output;
}

async function antigravityEvents(payload) {
  if (!payload.transcriptPath) return [];
  const lines = (await readFile(payload.transcriptPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const texts = [];
  for (const line of lines) {
    try { userTextsFromNode(JSON.parse(line), texts); } catch { /* ignore incomplete tail records */ }
  }
  return [...new Set(texts)].map((content, index) => ({ id: `transcript-${index}-${hash(content)}`, role: "user", content }));
}

function kimiEvents(payload) {
  const content = [payload.prompt, payload.user_prompt, payload.userPrompt, payload.message, payload.content].find((value) => typeof value === "string" && value.trim());
  return content ? [{ id: `prompt-${hash(content)}`, role: "user", content }] : [];
}

export async function ingestHookPayload(payload, options) {
  const events = options.provider === "antigravity" ? await antigravityEvents(payload) : kimiEvents(payload);
  if (!events.length) return { skipped: true, reason: "No user-authored prompt found." };
  const rootDir = resolve(payload.cwd || payload.workspacePaths?.[0] || process.cwd());
  const conversationId = String(payload.conversationId || payload.session_id || payload.sessionId || "current").replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 128);
  return (options.ingest ?? ingestAdapterBatch)({
    rootDir,
    slot: options.slot,
    endpoint: options.endpoint,
    batch: {
      format: "agentmon.adapter-batch/v1",
      adapter: options.provider,
      mode: options.provider === "antigravity" ? "snapshot" : "append",
      conversation: { id: conversationId, label: `${options.provider} conversation` },
      consent: { scope: "user_prompts_only", grantedAt: new Date().toISOString() },
      events,
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await ingestHookPayload(await readStdin(), options);
  if (options.provider === "antigravity") process.stdout.write("{}\n");
  if (result.skipped) process.stderr.write(`Agentmon hook skipped: ${result.reason}\n`);
}

if (process.argv[1]?.endsWith("universal-hook-adapter.mjs")) main().catch((error) => { process.stderr.write(`Agentmon hook: ${error.message}\n`); process.exitCode = 1; });
