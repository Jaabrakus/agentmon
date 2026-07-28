import { createHash } from "node:crypto";
import { sanitizePrompt } from "./prompt-sanitizer.mjs";

export const ADAPTER_BATCH_FORMAT = "agentmon.adapter-batch/v1";
export const FEED_FORMAT = "agentmon.feed/v1";

function safeIdentifier(value, label, fallback) {
  const identifier = String(value || fallback || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(identifier)) {
    throw new Error(`${label} must be a portable 1-128 character identifier.`);
  }
  return identifier;
}

export function validateAdapterBatch(input) {
  if (input?.format !== ADAPTER_BATCH_FORMAT) throw new Error(`Expected ${ADAPTER_BATCH_FORMAT}.`);
  if (input?.consent?.scope !== "user_prompts_only") throw new Error("Adapter batch requires user-prompts-only consent.");
  if (input.mode && !["append", "snapshot"].includes(input.mode)) throw new Error("Adapter mode must be append or snapshot.");
  if (!Array.isArray(input.events) || !input.events.length) throw new Error("Adapter batch requires at least one event.");
  if (input.events.length > 10_000) throw new Error("Adapter batch exceeds the 10,000 event limit.");
  safeIdentifier(input.adapter, "Adapter", "adapter");
  safeIdentifier(input.conversation?.id, "Conversation", "conversation");
  for (const [index, event] of input.events.entries()) {
    if (event.role !== "user") throw new Error(`Event ${index + 1} is not user-authored.`);
    safeIdentifier(event.id, `Event ${index + 1}`, `event-${index + 1}`);
    if (typeof event.content !== "string") throw new Error(`Event ${index + 1} requires text content.`);
    if (event.content.length > 200_000) throw new Error(`Event ${index + 1} exceeds the local prompt size limit.`);
  }
  return input;
}

function promptFromEvent(batch, event, index) {
  const sanitized = sanitizePrompt(event.content);
  if (!sanitized.text.trim()) return null;
  return {
    id: `${batch.adapter}:${batch.conversation.id}:${event.id || index + 1}`,
    text: sanitized.text,
    chars: sanitized.text.length,
    redactions: sanitized.redactions,
    createdAt: event.createdAt || null,
  };
}

function revisionFor(prompts) {
  const digest = createHash("sha256");
  for (const prompt of prompts) digest.update(`${prompt.id}\0${prompt.text}\0`);
  return digest.digest("hex");
}

export function createFeedFromAdapterBatch(input, existingFeed = null) {
  const batch = validateAdapterBatch(input);
  const incoming = batch.events.map((event, index) => promptFromEvent(batch, event, index)).filter(Boolean);
  const prior = batch.mode === "snapshot" ? [] : existingFeed?.prompts || [];
  const byId = new Map(prior.map((prompt) => [String(prompt.id), prompt]));
  for (const prompt of incoming) byId.set(prompt.id, prompt);
  const prompts = [...byId.values()].sort((left, right) => {
    const timeOrder = String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
    return timeOrder || String(left.id).localeCompare(String(right.id));
  });
  const redactions = prompts.reduce((sum, prompt) => sum + (Number(prompt.redactions) || 0), 0);
  const characters = prompts.reduce((sum, prompt) => sum + (Number(prompt.chars) || 0), 0);
  return {
    format: FEED_FORMAT,
    source: `adapter:${safeIdentifier(batch.adapter, "Adapter")}`,
    revision: revisionFor(prompts),
    generatedAt: new Date().toISOString(),
    consent: { scope: "user_prompts_only", grantedAt: batch.consent.grantedAt || null },
    thread: {
      id: `${batch.adapter}:${batch.conversation.id}`,
      label: String(batch.conversation.label || `${batch.adapter} conversation`).slice(0, 200),
    },
    prompts,
    totals: { prompts: prompts.length, characters, redactions },
    adapter: { id: batch.adapter, mode: batch.mode || "append", contract: ADAPTER_BATCH_FORMAT },
  };
}
