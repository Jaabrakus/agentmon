import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readAgentmonSnapshot } from "../../scripts/agentmon-db.mjs";

const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = resolve(RUNTIME_DIR, "../../scripts");
export const SCRIPT_PATH = resolve(SCRIPT_DIR, "agentmon.mjs");
export const COLLECTOR_PATH = resolve(SCRIPT_DIR, "collector.mjs");
const ENGINE_PATH = resolve(RUNTIME_DIR, "../agentmon-engine.mjs");
export const FORMAT = "agentmon.feed/v1";
export const ENGINE_VERSION = "0.8.0";
export const DEFAULT_INTERVAL = 1000;
export const VALID_ROLES = new Set(["builder", "researcher", "operator", "companion"]);
export const VALID_PROVIDERS = new Set(["openai", "anthropic", "google", "local", "custom"]);
export const VALID_INTENTS = new Set(["personal-preference", "directive", "product-spec", "brainstorm", "question", "reference"]);
export const VALID_REVIEWS = new Set(["confirmed", "rejected"]);
export const VALID_VARIANTS = new Set(["baseline", "agentmon"]);
export const VALID_QUALITIES = new Set(["pass", "fail"]);
export const VALID_OUTCOMES = new Set(["success", "failure", "unknown"]);

let enginePromise;
export function loadEngine() {
  enginePromise ??= import(pathToFileURL(ENGINE_PATH).href);
  return enginePromise;
}

export function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function safeSlot(value) {
  const slot = String(value || "main").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slot)) {
    throw new Error("Slot names must use 1-40 lowercase letters, numbers, or hyphens.");
  }
  return slot;
}

export async function readJson(path, fallback = null) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      if (!(error instanceof SyntaxError) || attempt === 3) throw error;
      await sleep(50 * (attempt + 1));
    }
  }
  return fallback;
}

export async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch {
    await writeFile(path, content, { mode: 0o600 });
    await unlink(temporary).catch(() => undefined);
  }
}

export async function writeJson(path, value) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function pathsFor(rootDir, slot) {
  const agentDir = resolve(rootDir, ".agentmon/roster", slot);
  return {
    agentDir,
    state: resolve(agentDir, "agentmon.json"),
    config: resolve(agentDir, "config.json"),
    promptprint: resolve(agentDir, "PROMPTPRINT.json"),
    skill: resolve(agentDir, "SKILL.md"),
    ledger: resolve(agentDir, "learning-ledger.json"),
    calibration: resolve(agentDir, "calibration.json"),
    actions: resolve(agentDir, "action-learning.json"),
    actionSkill: resolve(agentDir, "action-skills/SKILL.md"),
    squad: resolve(rootDir, ".agentmon/squad.json"),
    feed: resolve(rootDir, ".agentmon/feeds", `${slot}.json`),
    identityMeta: resolve(rootDir, ".agentmon/identity/trainer.json"),
    privateKey: resolve(rootDir, ".agentmon/identity/private-key.pem"),
    publicKey: resolve(rootDir, ".agentmon/identity/public-key.pem"),
    registry: resolve(rootDir, ".agentmon/ownership-registry.json"),
    database: resolve(rootDir, ".agentmon/agentmon.db"),
  };
}

export async function readAgentmonState(rootDir, slot) {
  return await readAgentmonSnapshot(rootDir, slot) || await readJson(pathsFor(rootDir, slot).state);
}

export function validateFeed(feed) {
  if (feed?.format !== FORMAT || !Array.isArray(feed.prompts)) {
    throw new Error(`Expected a ${FORMAT} feed with a prompts array.`);
  }
  if (feed.consent?.scope !== "user_prompts_only") {
    throw new Error("Feed is missing the user-prompts-only consent boundary.");
  }
}

export function sourcesFromFeed(feed, calibration = { corrections: {} }) {
  return feed.prompts.map((prompt, index) => ({
    id: String(prompt.id || `prompt-${index + 1}`),
    name: `codex-prompt-${index + 1}.md`,
    kind: "prompt",
    content: String(prompt.text || ""),
    size: Number(prompt.chars) || String(prompt.text || "").length,
    intentOverride: calibration.corrections?.[String(prompt.id || `prompt-${index + 1}`)]?.intent,
  })).filter((source) => source.content.trim());
}

export function growthProfile(agentmon) {
  return agentmon?.growthPromptprint || agentmon?.promptprint;
}
