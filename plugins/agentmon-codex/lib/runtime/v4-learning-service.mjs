import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEffectivenessReport, outcomeDigest, recordOutcome } from "../effectiveness/outcome-engine.mjs";
import { recordPortabilityResult } from "../effectiveness/portability-engine.mjs";
import { readModelTargets, runConfiguredPortability } from "../effectiveness/model-target-runner.mjs";
import { createLocalModelProvider } from "../local-model-provider.mjs";
import { createRoutedDownlink, routeAgentmons } from "../routing/context-router.mjs";
import { addSemanticCandidates, buildSemanticEvidencePacket, promoteSemanticCandidate, reviewSemanticCandidate } from "../semantics/semantic-induction.mjs";
import { planSquadQuest } from "../squad/squad-orchestrator.mjs";
import { persistDerivedMutation } from "./procedure-proof-service.mjs";
import { readAgentmonState, safeSlot } from "./storage.mjs";

export async function recordOutcomeFeedback(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const recorded = recordOutcome(state, {
    format: "agentmon.outcome/v1",
    id: options.id,
    conversation: options.conversation,
    taskDigest: options.taskDigest,
    procedureIds: options.procedureIds,
    outcome: options.outcome,
    rating: options.rating,
    retryCount: options.retryCount,
    correctionLevel: options.correctionLevel,
    durationMs: options.durationMs,
    tokenCount: options.tokenCount,
    provider: options.provider,
    model: options.model,
  });
  const result = await persistDerivedMutation(rootDir, slot, recorded.agentmon, "outcome-feedback", {
    outcome: { id: recorded.event.id, taskDigest: recorded.event.taskDigest, procedureIds: recorded.event.procedureIds, outcome: recorded.event.outcome, rating: recorded.event.rating, score: recorded.agentmon.effectivenessReport.averageScore, rawTextStored: false, proofEligible: false },
  });
  return { ...result, outcome: recorded.event, effectiveness: recorded.agentmon.effectivenessReport };
}

export function usefulnessReport(agentmon) {
  return agentmon.effectivenessReport || buildEffectivenessReport(agentmon.outcomeEvents || [], agentmon.proceduralSkills || []);
}

export async function loadRoster(rootDir) {
  const directory = resolve(rootDir, ".agentmon/roster");
  const slots = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(slots.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try { return { ...JSON.parse(await readFile(resolve(directory, entry.name, "agentmon.json"), "utf8")), slot: entry.name }; }
    catch { return null; }
  }))).filter(Boolean);
}

export async function routeContext(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const roster = options.agentmons || await loadRoster(rootDir);
  return createRoutedDownlink(routeAgentmons(String(options.query || ""), roster, {
    allowedPermissions: options.allowedPermissions || [],
    allowTesting: options.allowTesting === true,
    advisoryMode: options.advisoryMode === true,
    includeIdentityFallback: options.includeIdentityFallback === true,
    minimumScore: options.minimumScore,
    maxAgentmons: options.maxAgentmons,
    maxProcedures: options.maxProcedures,
  }));
}

export async function suggestSemanticProcedures(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const provider = options.provider || createLocalModelProvider(options.localModelConfig);
  const packet = buildSemanticEvidencePacket(state);
  const suggestions = await provider.proposeProcedures(packet);
  const agentmon = addSemanticCandidates(state, suggestions, { model: provider.config?.model });
  return await persistDerivedMutation(rootDir, slot, agentmon, "semantic-proposals", {
    semantic: { candidateIds: (agentmon.procedureProposals || []).map((candidate) => candidate.id), evidenceDigest: outcomeDigest(JSON.stringify(packet)), rawPromptsIncluded: false, deployable: false },
  });
}

export async function reviewAndPromoteSemanticProcedure(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  let agentmon = reviewSemanticCandidate(state, options.proposal, options.review);
  let procedure = null;
  if (options.review === "confirmed") ({ agentmon, procedure } = promoteSemanticCandidate(agentmon, options.proposal));
  return await persistDerivedMutation(rootDir, slot, agentmon, "semantic-proposal-review", {
    semantic: { proposalId: options.proposal, review: options.review, promotedProcedureId: procedure?.id || null, requiresArenaProof: Boolean(procedure) },
  });
}

export async function addPortabilityResult(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const recorded = recordPortabilityResult(state, options);
  const result = await persistDerivedMutation(rootDir, slot, recorded.agentmon, "portability-result", { portability: recorded.result });
  return { ...result, portability: recorded.agentmon.portabilityReport };
}

export async function runPortabilityTargets(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  if (!options.targets || !options.suite || !options.procedure) throw new Error("portability-run requires --targets, --suite, and --procedure.");
  const [manifest, suite] = await Promise.all([readModelTargets(options.targets), readFile(options.suite, "utf8").then(JSON.parse)]);
  const result = await runConfiguredPortability(state, { ...options, rootDir, manifest, suite, procedureId: options.procedure });
  const mutation = await persistDerivedMutation(rootDir, slot, result.agentmon, "portability-run", {
    portability: { report: result.report, targets: result.privateRuns.map((run) => ({ provider: run.target.provider, model: run.target.model, baselineScore: run.result.baselineScore, agentmonScore: run.result.agentmonScore, suiteDigest: run.result.suiteDigest })) },
  });
  return { ...mutation, portability: result.report };
}

export async function createSquadPlan(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const roster = await loadRoster(rootDir);
  return planSquadQuest(options.objective, roster, { allowedPermissions: options.allowedPermissions || [], allowTesting: false });
}

export async function recordOutcomeCommand(args) {
  if (!args.procedure || !args.taskDigest || !args.outcome || !args.rating) throw new Error("outcome-record requires --procedure, --task-digest, --outcome, and --rating.");
  const result = await recordOutcomeFeedback({ ...args, procedureIds: [args.procedure] });
  process.stdout.write(`Private outcome recorded: ${args.rating} · ${args.outcome}\nEffectiveness: ${result.effectiveness.averageScore} · ${result.effectiveness.totalOutcomes} outcomes\nRaw prompt/response stored: no · arena proof awarded: no\n`);
}

export async function showEffectivenessCommand(args) {
  const state = await readAgentmonState(resolve(args.rootDir || process.cwd()), safeSlot(args.slot));
  if (!state) throw new Error(`No Agentmon in slot '${safeSlot(args.slot)}'.`);
  const report = usefulnessReport(state);
  process.stdout.write(`${state.form || state.species} usefulness\nOutcomes: ${report.totalOutcomes} · average ${report.averageScore} · beneficial ${report.beneficialProcedures} · regressed ${report.regressedProcedures}\n`);
  for (const result of report.procedures.filter((item) => item.activations)) process.stdout.write(`- ${result.procedureId}: ${result.status} · ${result.activations} uses · ${result.helpfulRate}% helpful · score ${result.averageScore}\n`);
  process.stdout.write("Real-world feedback is raw-free and cannot award arena proof.\n");
}

export async function routeContextCommand(args) {
  if (!args.file) throw new Error("route requires --file PATH containing the current task. The file is read transiently and never persisted by Agentmon.");
  const query = await readFile(args.file, "utf8");
  const route = await routeContext({ ...args, query, allowedPermissions: String(args.permissions || "").split(",").filter(Boolean) });
  if (!route?.selected) process.stdout.write("No proven, permission-compatible Agentmon procedure matched.\n");
  else process.stdout.write(`${route.selected.name} selected · score ${route.selected.score}\n${route.selected.procedures.map((procedure) => `- ${procedure.name}: ${procedure.score}`).join("\n")}\nQuery digest: ${route.queryDigest}\nRaw query stored: no\n`);
}

export async function semanticSuggestCommand(args) {
  const result = await suggestSemanticProcedures(args);
  const candidates = result.agentmon.procedureProposals || [];
  process.stdout.write(`Semantic induction proposed ${candidates.length} bounded candidate(s).\n`);
  for (const candidate of candidates) process.stdout.write(`- ${candidate.id}: ${candidate.name} · ${candidate.confidence}% · ${candidate.trainerReview}\n`);
  process.stdout.write("The local model selected primitives only. Nothing is executable until trainer confirmation and arena proof.\n");
}

export async function semanticReviewCommand(args) {
  if (!args.proposal || !new Set(["confirmed", "rejected"]).has(args.review)) throw new Error("semantic-review requires --proposal ID --review confirmed|rejected.");
  const result = await reviewAndPromoteSemanticProcedure(args);
  process.stdout.write(`Semantic candidate ${args.proposal}: ${args.review}.\n${args.review === "confirmed" ? "Promoted to arena testing; not deployable until proven." : "Candidate rejected and not executable."}\n`);
  return result;
}

export async function portabilityRecordCommand(args) {
  if (!args.procedure || !args.provider || !args.model || !args.suiteDigest) throw new Error("portability-record requires --procedure, --provider, --model, and --suite-digest.");
  const result = await addPortabilityResult({ ...args, procedureId: args.procedure });
  process.stdout.write(`Portability result recorded for ${args.provider}:${args.model}.\nModels tested: ${result.portability.modelsTested} · portable combinations: ${result.portability.portableCombinations}\nRaw prompts/outputs stored in database: no\n`);
}

export async function portabilityRunCommand(args) {
  const result = await runPortabilityTargets(args);
  process.stdout.write(`Portability run complete across ${result.portability.modelsTested} enabled target(s).\nPortable combinations: ${result.portability.portableCombinations}\nOnly scores, digests, and target descriptors were persisted; prompts and model outputs were not.\n`);
}

export async function squadPlanCommand(args) {
  if (!args.objective) throw new Error("squad-plan requires --objective TEXT.");
  const plan = await createSquadPlan({ ...args, allowedPermissions: String(args.permissions || "").split(",").filter(Boolean) });
  process.stdout.write(`Squad plan ${plan.id} · ${plan.assignments.length} proposed assignments\n`);
  for (const assignment of plan.assignments) process.stdout.write(`- ${assignment.role}: ${assignment.slot} · ${assignment.procedureIds.join(", ")}\n`);
  process.stdout.write("Execution is off. Every assignment requires explicit approval. Raw objective stored: no.\n");
}
