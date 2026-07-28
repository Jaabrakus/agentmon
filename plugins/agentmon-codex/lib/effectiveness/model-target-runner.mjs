import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCodexCliArenaProvider, createOpenAICompatibleArenaProvider, runArenaSuite, validateArenaSuite } from "../arena-harness.mjs";
import { assertLoopbackModelUrl } from "../local-model-provider.mjs";
import { runPortabilityMatrix } from "./portability-engine.mjs";

export const MODEL_TARGETS_FORMAT = "agentmon.model-targets/v1";
const PROVIDERS = new Set(["openai", "anthropic", "google", "kimi", "venice", "local", "custom"]);
const ADAPTERS = new Set(["local-openai-compatible", "codex-cli"]);

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedId(value, label) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id)) throw new Error(`${label} must be a portable identifier.`);
  return id;
}

function rejectSecrets(target) {
  const forbidden = Object.keys(target).find((key) => /(?:api.?key|token|secret|authorization|credential)/i.test(key));
  if (forbidden) throw new Error(`Model target manifests cannot contain credentials (${forbidden}).`);
}

export function validateModelTargets(input) {
  if (input?.format !== MODEL_TARGETS_FORMAT) throw new Error(`Expected ${MODEL_TARGETS_FORMAT}.`);
  if (!Array.isArray(input.targets) || !input.targets.length || input.targets.length > 12) throw new Error("Model target manifest requires 1-12 targets.");
  const seen = new Set();
  const targets = input.targets.map((candidate) => {
    rejectSecrets(candidate);
    const id = boundedId(candidate.id, "Target id");
    if (seen.has(id)) throw new Error(`Duplicate model target: ${id}.`);
    seen.add(id);
    if (!ADAPTERS.has(candidate.adapter)) throw new Error(`Unsupported model target adapter: ${candidate.adapter}.`);
    if (!PROVIDERS.has(candidate.provider)) throw new Error(`Unsupported model provider: ${candidate.provider}.`);
    const model = String(candidate.model || "").trim();
    if (!model || model.length > 128) throw new Error(`Target ${id} requires a bounded model id.`);
    const target = { id, adapter: candidate.adapter, provider: candidate.provider, model, enabled: candidate.enabled === true };
    if (candidate.adapter === "local-openai-compatible") target.baseUrl = assertLoopbackModelUrl(candidate.baseUrl || "http://127.0.0.1:11434/v1").toString().replace(/\/$/, "");
    if (candidate.judgeModel) target.judgeModel = String(candidate.judgeModel).trim().slice(0, 128);
    if (candidate.reasoningEffort) target.reasoningEffort = String(candidate.reasoningEffort);
    return target;
  });
  return { format: MODEL_TARGETS_FORMAT, targets };
}

export async function readModelTargets(path) {
  return validateModelTargets(JSON.parse(await readFile(resolve(path), "utf8")));
}

export function createTargetProvider(target, options = {}) {
  if (target.adapter === "codex-cli") return createCodexCliArenaProvider({ cwd: options.rootDir, model: target.model, reasoningEffort: target.reasoningEffort || "medium" });
  return createOpenAICompatibleArenaProvider({ baseUrl: target.baseUrl, model: target.model, temperature: 0, maxOutputTokens: options.maxOutputTokens || 1200, seed: options.seed || 7 });
}

export async function runConfiguredPortability(agentmon, options = {}) {
  const manifest = validateModelTargets(options.manifest);
  const suite = validateArenaSuite(options.suite);
  const targets = manifest.targets.filter((target) => target.enabled);
  if (!targets.length) throw new Error("No model target is enabled. Enable one target explicitly before running models.");
  const providerFactory = options.providerFactory || createTargetProvider;
  const targetById = new Map(targets.map((target) => [target.id, target]));
  return runPortabilityMatrix(agentmon, {
    procedureId: options.procedureId,
    suite,
    suiteDigest: digest(suite),
    targets: targets.map((target) => ({ provider: target.provider, model: target.model, targetId: target.id })),
    runner: async ({ target }) => {
      const config = targetById.get(target.targetId);
      const contestant = providerFactory(config, { rootDir: options.rootDir, seed: options.seed, maxOutputTokens: options.maxOutputTokens });
      const judge = config.judgeModel ? providerFactory({ ...config, model: config.judgeModel }, { rootDir: options.rootDir, seed: options.seed, maxOutputTokens: 500 }) : null;
      const result = await runArenaSuite({ suite, agentmon, procedureId: options.procedureId, contestant, judge, repetitions: options.repetitions || 1, seed: options.seed });
      return {
        baselineScore: result.run.summary.baseline.averageScore,
        agentmonScore: result.run.summary.agentmon.averageScore,
        runDigest: digest({ configDigest: result.run.configDigest, summary: result.run.summary }),
      };
    },
  });
}
