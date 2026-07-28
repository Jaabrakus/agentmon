import { createHash, randomUUID } from "node:crypto";

export const ACTION_EVENT_FORMAT = "agentmon.action-event/v1";
export const ACTION_SKILL_FORMAT = "agentmon.action-skill/v1";
export const RESONANCE_MODES = Object.freeze(["mirror", "counterpart", "mentor", "specialist", "operator", "guardian"]);
export const LIFE_MOVES = Object.freeze(["check", "call", "raise", "stay", "fold", "bluff", "all-in"]);
export const EMOTION_STATES = Object.freeze(["neutral", "calm", "curious", "uncertain", "anxious", "frustrated", "confident", "energized", "overwhelmed", "guarded", "connected"]);
export const ACTION_KINDS = Object.freeze(["navigation", "control", "form-submit", "checkpoint"]);
export const ACTION_CONTROLS = Object.freeze([
  "open", "create", "edit", "save", "submit", "send", "approve", "reject", "delete", "search",
  "filter", "sort", "upload", "download", "copy", "share", "cancel", "continue", "back", "menu", "unknown",
]);
export const PAGE_CLASSES = Object.freeze([
  "dashboard", "project", "document", "issue", "inbox", "compose", "search", "settings", "profile",
  "checkout", "form", "detail", "list", "unknown",
]);

const BLOCKED_KEYS = /^(?:text|value|values|label|url|path|query|selector|html|content|prompt|response|output|message|screenshot|image|keystroke|keypress|password|credential|cookie|token)$/i;
const HIGH_RISK = new Set(["approve", "delete", "send", "share", "submit", "upload"]);
const MEDIUM_RISK = new Set(["create", "edit", "save", "reject", "download", "copy"]);
const IRREVERSIBLE = new Set(["approve", "delete", "send", "share", "submit", "upload"]);

export function actionDigest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function assertRawFree(value, path = "action") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertRawFree(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKED_KEYS.test(key)) throw new Error(`Action events may not contain ${path}.${key}.`);
    assertRawFree(nested, `${path}.${key}`);
  }
}

function safeEnum(value, allowed, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!allowed.includes(normalized)) throw new Error(`Unknown ${label}: ${normalized || "empty"}.`);
  return normalized;
}

function safeIdentifier(value, label, maximum = 128) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maximum || !/^[a-zA-Z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${label}.`);
  return normalized;
}

export function validateTrainerEmotion(input = {}) {
  const source = input?.source === "trainer-declared" ? "trainer-declared" : "unspecified";
  const requested = String(input?.state || "neutral").trim().toLowerCase();
  const state = source === "trainer-declared" && EMOTION_STATES.includes(requested) ? requested : "neutral";
  const numericIntensity = Number(input?.intensity);
  const intensity = source === "trainer-declared" && Number.isFinite(numericIntensity)
    ? Math.max(1, Math.min(5, Math.round(numericIntensity)))
    : 0;
  const declaredAt = source === "trainer-declared" && Number.isFinite(Date.parse(input?.declaredAt))
    ? input.declaredAt
    : null;
  return {
    state,
    intensity,
    source,
    declaredAt,
    policy: "Temporary trainer-declared context; never treated as identity, evidence, consent, or permission.",
  };
}

export function actionRisk(control) {
  if (HIGH_RISK.has(control)) return "high";
  if (MEDIUM_RISK.has(control)) return "medium";
  return "low";
}

export function isActionReversible(control) {
  return !IRREVERSIBLE.has(control);
}

export function semanticActionKey(event) {
  return `${event.site}:${event.pageClass}:${event.kind}:${event.control}`;
}

export function validateActionEvent(input) {
  assertRawFree(input);
  if (input?.format && input.format !== ACTION_EVENT_FORMAT) throw new Error(`Expected ${ACTION_EVENT_FORMAT}.`);
  const site = String(input?.site || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(site)) throw new Error("Invalid action-event site.");
  const routeDigest = String(input?.routeDigest || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(routeDigest)) throw new Error("Action events require a route digest, never a URL or path.");
  const control = safeEnum(input?.control || "unknown", ACTION_CONTROLS, "action control");
  const observedAt = input?.observedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("Action observedAt must be an ISO timestamp.");
  const event = {
    format: ACTION_EVENT_FORMAT,
    id: input?.id ? safeIdentifier(input.id, "action-event id") : `action-${randomUUID()}`,
    session: safeIdentifier(input?.session, "action session"),
    site,
    routeDigest,
    pageClass: safeEnum(input?.pageClass || "unknown", PAGE_CLASSES, "page class"),
    kind: safeEnum(input?.kind, ACTION_KINDS, "action kind"),
    control,
    risk: actionRisk(control),
    reversible: isActionReversible(control),
    observedAt,
    emotion: validateTrainerEmotion(input?.emotion),
    source: "approved-browser-action-learning",
    privacy: { rawTextStored: false, fieldValuesStored: false, screenshotsStored: false, keystrokesStored: false },
  };
  event.digest = actionDigest(event);
  return event;
}

export function resonanceProfile(mode) {
  const resonance = safeEnum(mode, RESONANCE_MODES, "resonance mode");
  const profiles = {
    mirror: { purpose: "Reflect the trainer's proven sequence.", executionMode: "suggest-only", addsCheckpoint: false },
    counterpart: { purpose: "Catch missing checks before consequential actions.", executionMode: "suggest-only", addsCheckpoint: true },
    mentor: { purpose: "Compare the observed sequence with a higher-value alternative.", executionMode: "suggest-only", addsCheckpoint: true },
    specialist: { purpose: "Apply one site-scoped workflow precisely.", executionMode: "review-only", addsCheckpoint: false },
    operator: { purpose: "Execute approved, proven, low-risk steps.", executionMode: "approved-low-risk", addsCheckpoint: true },
    guardian: { purpose: "Review risk, permissions, and recovery without executing.", executionMode: "review-only", addsCheckpoint: true },
  };
  return { mode: resonance, ...profiles[resonance] };
}

export function deterministicResonance(agentmon) {
  const archetype = String(agentmon?.promptprint?.archetype || "").toLowerCase();
  const named = RESONANCE_MODES.find((mode) => archetype.includes(mode));
  if (named) return named;
  const dna = agentmon?.lineage?.genesisDNA || agentmon?.dna || agentmon?.id || "unbound";
  const index = Number.parseInt(actionDigest(dna).slice(0, 8), 16) % RESONANCE_MODES.length;
  return RESONANCE_MODES[index];
}
