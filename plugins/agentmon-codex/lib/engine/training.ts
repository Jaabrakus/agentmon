import { promptprintMeta, skillLibrary } from "./catalog";
import { clamp, hashText } from "./math";
import { validateProcedureRoutingPolicy } from "./procedure-routing";
import { archetypeForms, archetypeVoices, combinationRecipes, procedureRecipes, promptprintPatterns, skillPatterns } from "./recipes";
import type { AgentLoop, AgentPermission, AgentSkillPackage, Agentmon, AgentmonArenaReport, ArenaVariant, BehaviorHypothesis, DecisionEpisode, DecisionQuality, FusionMove, HatchReadiness, LearnedSkill, ObservedOutcome, ProcedureArenaResult, ProcedureProposal, ProcedureReview, ProcedureTrial, ProceduralSkill, PromptIntent, PromptObservation, Promptprint, PromptprintKey, SkillCandidate, SkillCombination, SkillKey, SkillStage, TrainingSource } from "./types";

function buildPersonalArchetype(dominant: PromptprintKey, secondary: PromptprintKey, signatureSeed: string) {
  const seed = hashText(`${signatureSeed}|${dominant}|${secondary}|archetype`);
  const voices = archetypeVoices[dominant];
  const forms = archetypeForms[secondary];
  return `${voices[seed % voices.length]} ${forms[Math.floor(seed / voices.length) % forms.length]}`;
}

function countMatches(text: string, pattern: RegExp) {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

const intentWeights: Record<PromptIntent, number> = {
  "personal-preference": 1,
  directive: 0.9,
  "product-spec": 0.25,
  brainstorm: 0.2,
  question: 0.15,
  reference: 0.05,
};

export const stageRank: Record<SkillStage, number> = { observed: 0, hypothesis: 1, validated: 2, learned: 3 };

function classifyPromptIntent(source: TrainingSource): { intent: PromptIntent; confidence: number } {
  const text = source.content.trim();
  const lower = text.toLowerCase();
  if (source.kind === "skills" || source.kind === "resource" || (/```/.test(text) && text.split("\n").length > 8)) return { intent: "reference", confidence: 92 };
  if (/\b(imagine|what if|i wonder|maybe|perhaps|brainstorm|could we|it would be interesting)\b/i.test(text)) return { intent: "brainstorm", confidence: 86 };
  if (/\b(i prefer|i always|i tend to|i work best|for me|please always|please never|don't|do not|no no|focus)\b/i.test(text)) return { intent: "personal-preference", confidence: 88 };
  if (/\?$/.test(text) || (/\b(how|what|why|when|where|who|would|should|can|could|is it|are we)\b/i.test(text) && text.includes("?"))) return { intent: "question", confidence: 86 };
  if (/^(?:(?:okay|ok)\s+)?(?:(?:let'?s\s+)|(?:please\s+))?(?:do it|build|create|make|implement|fix|debug|run|check|verify|search|research|open|cross-check|inspect|update|write|add|remove|show|use|ship|continue|enhance)\b/i.test(text)) return { intent: "directive", confidence: 90 };
  const productTerms = /\b(agentmon|agentmons|app|engine|feature|database|backend|frontend|user|users|product|game|plugin|addon|desktop|cloud|supabase|trading card)\b/i;
  const specificationTerms = /\b(the goal|we need|we want|should|must|require|build|make|add|support|version)\b/i;
  if (productTerms.test(text) && specificationTerms.test(text)) return { intent: "product-spec", confidence: 90 };
  if (productTerms.test(text)) return { intent: "product-spec", confidence: 72 };
  if (/\b(i|my|we|our|let's|lets)\b/i.test(lower)) return { intent: "personal-preference", confidence: 62 };
  return { intent: "reference", confidence: 55 };
}

export function observeTrainingSources(sources: TrainingSource[]): PromptObservation[] {
  return sources.filter((source) => source.kind !== "resource" || source.content.trim()).map((source) => {
    const classified = classifyPromptIntent(source);
    const intent = source.intentOverride ?? classified.intent;
    const confidence = source.intentOverride ? 100 : classified.confidence;
    const signals = (Object.keys(skillPatterns) as SkillKey[]).filter((skill) => countMatches(source.content, skillPatterns[skill]) > 0);
    const imperativeStart = /^(?:(?:okay|ok)\s+)?(?:(?:let'?s\s+)|(?:please\s+))?(?:do it|build|create|make|implement|fix|debug|run|check|verify|search|research|open|cross-check|inspect|update|write|add|remove|show|use|ship|continue|enhance)\b/i.test(source.content.trim());
    const learningWeight = intentWeights[intent];
    return {
      sourceId: source.id,
      digest: hashText(`${source.kind}|${source.id}|${source.content}`).toString(16).padStart(8, "0").toUpperCase(),
      intent,
      engineIntent: classified.intent,
      classificationSource: source.intentOverride ? "trainer" : "engine",
      confidence,
      learningWeight,
      signals,
      decisionContext: {
        known: { sourceKind: source.kind, characters: source.size, hasQuestionMark: source.content.includes("?"), imperativeStart, signals },
        unknown: ["Trainer's intended long-term habit", "Task outcome", "Whether the resulting answer was accepted or corrected"],
        estimates: { intent, confidence, learningWeight },
      },
    };
  });
}

function buildDecisionEpisodes(observations: PromptObservation[]): DecisionEpisode[] {
  return observations.map((observation) => ({
    id: `episode-${observation.digest}`,
    sourceId: observation.sourceId,
    digest: observation.digest,
    context: observation.decisionContext,
    prediction: { intent: observation.intent, engineIntent: observation.engineIntent, confidence: observation.confidence },
    resolution: observation.classificationSource === "trainer"
      ? { status: "trainer-corrected", correctedIntent: observation.intent }
      : { status: "unreviewed" },
  }));
}

function candidateStage(evidenceCount: number, behavioralEvidenceCount: number, weightedEvidence: number): SkillStage {
  if (evidenceCount >= 4 && behavioralEvidenceCount >= 3 && weightedEvidence >= 3.4) return "learned";
  if (evidenceCount >= 3 && behavioralEvidenceCount >= 2 && weightedEvidence >= 2.2) return "validated";
  if (evidenceCount >= 2 && behavioralEvidenceCount >= 1 && weightedEvidence >= 1.1) return "hypothesis";
  return "observed";
}

function buildSkillCandidates(observations: PromptObservation[]): SkillCandidate[] {
  return (Object.keys(skillLibrary) as SkillKey[]).flatMap((skill) => {
    const evidence = observations.filter((observation) => observation.signals.includes(skill));
    if (!evidence.length) return [];
    const behavioral = evidence.filter((observation) => observation.intent === "directive" || observation.intent === "personal-preference");
    const weightedEvidence = Number(evidence.reduce((sum, observation) => sum + observation.learningWeight, 0).toFixed(2));
    const stage = candidateStage(evidence.length, behavioral.length, weightedEvidence);
    const positiveIntents = [...new Set(evidence.map((observation) => observation.intent))];
    const confidence = Math.min(96, Math.round(18 + weightedEvidence * 14 + behavioral.length * 7 + Math.min(12, evidence.length * 2)));
    return [{
      id: skill,
      name: skillLibrary[skill].name,
      stage,
      confidence,
      evidenceCount: evidence.length,
      behavioralEvidenceCount: behavioral.length,
      weightedEvidence,
      sourceDigests: evidence.map((observation) => observation.digest),
      positiveIntents,
      reason: behavioral.length
        ? `${behavioral.length} behavioral prompt${behavioral.length === 1 ? "" : "s"} plus ${evidence.length - behavioral.length} contextual prompt${evidence.length - behavioral.length === 1 ? "" : "s"}.`
        : "Seen only in questions, brainstorming, product specifications, or reference material; not yet treated as trainer behavior.",
    }];
  }).sort((left, right) => stageRank[right.stage] - stageRank[left.stage] || right.weightedEvidence - left.weightedEvidence);
}

function buildBehaviorHypotheses(candidates: SkillCandidate[], observations: PromptObservation[]): BehaviorHypothesis[] {
  return candidates.map((candidate) => {
    const evidenceFor = observations
      .filter((observation) => candidate.sourceDigests.includes(observation.digest) && (observation.intent === "directive" || observation.intent === "personal-preference"))
      .map((observation) => observation.digest);
    const behavioralSet = new Set(evidenceFor);
    const evidenceAgainst = observations
      .filter((observation) => observation.signals.includes(candidate.id)
        && observation.classificationSource === "trainer"
        && (observation.engineIntent === "directive" || observation.engineIntent === "personal-preference")
        && observation.intent !== "directive"
        && observation.intent !== "personal-preference")
      .map((observation) => observation.digest);
    const status = evidenceAgainst.length > evidenceFor.length
      ? "weakened"
      : candidate.stage === "learned" || candidate.stage === "validated" ? "strengthened" : "open";
    return {
      id: candidate.id,
      hypothesis: `${candidate.name} is a repeatable trainer behavior rather than a topic merely being discussed.`,
      confidence: candidate.confidence,
      status,
      evidenceFor,
      evidenceAgainst,
      neutralContext: candidate.sourceDigests.filter((digest) => !behavioralSet.has(digest)),
      guardrail: "This is a testable workflow hypothesis, not a personality diagnosis or proof of hidden reasoning.",
    };
  });
}

function wilsonLowerBound(passes: number, trials: number) {
  if (!trials) return 0;
  const z = 1.96;
  const rate = passes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = rate + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * trials)) / trials);
  return Math.max(0, Math.round(((center - margin) / denominator) * 100));
}

export function buildArenaReport(procedures: ProceduralSkill[], trials: ProcedureTrial[] = []): AgentmonArenaReport {
  const results = procedures.map((procedure) => {
    const summarize = (variant: ArenaVariant) => {
      const rows = trials.filter((trial) => trial.procedureId === procedure.id && trial.variant === variant && trial.source === "automatic");
      const passes = rows.filter((trial) => trial.decisionQuality === "pass").length;
      return { trials: rows.length, passes, passRate: rows.length ? Math.round((passes / rows.length) * 100) : 0, lowerBound: wilsonLowerBound(passes, rows.length) };
    };
    const baseline = summarize("baseline");
    const agentmon = summarize("agentmon");
    const lift = agentmon.passRate - baseline.passRate;
    const resolved = trials.filter((trial) => trial.procedureId === procedure.id && trial.outcome !== "unknown");
    const agreements = resolved.filter((trial) => (trial.decisionQuality === "pass") === (trial.outcome === "success")).length;
    const outcomeAgreement = resolved.length ? Math.round((agreements / resolved.length) * 100) : null;
    let status: ProcedureArenaResult["status"] = "untested";
    if (baseline.trials || agentmon.trials) status = "testing";
    if (baseline.trials >= 5 && agentmon.trials >= 5 && lift >= 10 && agentmon.lowerBound >= baseline.lowerBound) status = "proven";
    if (baseline.trials >= 5 && agentmon.trials >= 5 && lift <= -10) status = "regressed";
    return { procedureId: procedure.id, baseline, agentmon, lift, outcomeAgreement, status };
  });
  return { format: "agentmon.arena/v1", results, provenProcedures: results.filter((result) => result.status === "proven").length, testedProcedures: results.filter((result) => result.status !== "untested").length };
}

export function reviewAgentmonProcedure(agentmon: Agentmon, procedureId: string, review: Exclude<ProcedureReview, "unreviewed">) {
  if (!agentmon.proceduralSkills?.some((procedure) => procedure.id === procedureId)) throw new Error(`Unknown procedure: ${procedureId}`);
  const proceduralSkills = agentmon.proceduralSkills.map((procedure) => procedure.id === procedureId
    ? {
      ...procedure,
      stage: review === "confirmed" && procedure.provenance?.kind === "trainer-proposal" && stageRank[procedure.stage] < stageRank.validated ? "validated" as const : procedure.stage,
      trainerConfirmed: review === "confirmed",
      trainerReview: review,
    }
    : procedure);
  return { ...agentmon, proceduralSkills, arenaReport: buildArenaReport(proceduralSkills, agentmon.procedureTrials ?? []), trainedAt: new Date().toISOString() };
}

function validateProcedureStrings(values: unknown, label: string, minimum = 1, maximum = 12): string[] {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) throw new Error(`${label} requires ${minimum}-${maximum} entries.`);
  const strings = values.map((value) => String(value || "").trim());
  if (strings.some((value) => !value || value.length > 500)) throw new Error(`${label} entries must contain 1-500 characters.`);
  return strings;
}

export function proposeAgentmonProcedure(agentmon: Agentmon, input: ProcedureProposal) {
  if (input?.format !== "agentmon.procedure-proposal/v1") throw new Error("Expected agentmon.procedure-proposal/v1.");
  const id = String(input.id || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("Procedure proposal id must use 1-64 lowercase letters, numbers, or hyphens.");
  if (agentmon.proceduralSkills?.some((procedure) => procedure.id === id)) throw new Error(`Procedure already exists: ${id}.`);
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const trigger = String(input.trigger || "").trim();
  if (!name || name.length > 100 || !description || description.length > 500 || !trigger || trigger.length > 500) {
    throw new Error("Procedure proposal requires bounded name, description, and trigger text.");
  }
  const allowedPermissions = new Set<AgentPermission>(["read-files", "write-files", "run-tools", "network", "delegate", "memory"]);
  const permissions = [...new Set(validateProcedureStrings(input.permissions, "Permissions", 1, 6))] as AgentPermission[];
  if (permissions.some((permission) => !allowedPermissions.has(permission))) throw new Error("Procedure proposal contains an unknown permission.");
  const behavioral = (agentmon.observations ?? []).filter((observation) => observation.intent === "directive" || observation.intent === "personal-preference");
  if (behavioral.length < 3) throw new Error("A trainer-specific proposal requires at least three behavioral observations.");
  const evidenceDigests = [...new Set(behavioral.map((observation) => observation.digest))];
  const createdAt = new Date().toISOString();
  const proposal: ProceduralSkill = {
    id,
    name,
    description,
    stage: "hypothesis",
    confidence: Math.min(79, 40 + evidenceDigests.length * 4),
    evidenceCount: evidenceDigests.length,
    behavioralEvidenceCount: evidenceDigests.length,
    trigger,
    routing: validateProcedureRoutingPolicy(input.routing),
    inputs: validateProcedureStrings(input.inputs, "Inputs"),
    steps: validateProcedureStrings(input.steps, "Steps", 2),
    completionCriteria: validateProcedureStrings(input.completionCriteria, "Completion criteria"),
    failureRules: validateProcedureStrings(input.failureRules, "Failure rules"),
    permissions,
    evidenceDigests,
    trainerConfirmed: false,
    trainerReview: "unreviewed",
    provenance: { kind: "trainer-proposal", version: 1, createdAt },
  };
  const proceduralSkills = [...(agentmon.proceduralSkills ?? []), proposal];
  return { ...agentmon, proceduralSkills, arenaReport: buildArenaReport(proceduralSkills, agentmon.procedureTrials ?? []), trainedAt: createdAt };
}

export function recordAgentmonArenaTrial(agentmon: Agentmon, input: { procedureId: string; variant: ArenaVariant; decisionQuality: DecisionQuality; outcome?: ObservedOutcome; source?: "manual" | "automatic"; runId?: string }) {
  if (!agentmon.proceduralSkills?.some((procedure) => procedure.id === input.procedureId)) throw new Error(`Unknown procedure: ${input.procedureId}`);
  const recordedAt = new Date().toISOString();
  const trial: ProcedureTrial = {
    id: `trial-${hashText(`${agentmon.id}|${input.procedureId}|${input.variant}|${recordedAt}|${agentmon.procedureTrials?.length ?? 0}`).toString(16).padStart(8, "0")}`,
    procedureId: input.procedureId,
    variant: input.variant,
    decisionQuality: input.decisionQuality,
    outcome: input.outcome ?? "unknown",
    recordedAt,
    source: input.source ?? "manual",
    runId: input.runId,
  };
  const procedureTrials = [...(agentmon.procedureTrials ?? []), trial];
  return { ...agentmon, procedureTrials, arenaReport: buildArenaReport(agentmon.proceduralSkills ?? [], procedureTrials), trainedAt: recordedAt };
}

function buildProceduralSkills(candidates: SkillCandidate[]): ProceduralSkill[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return procedureRecipes.flatMap((recipe) => {
    const requirements = recipe.requires.map((skill) => byId.get(skill));
    if (requirements.some((candidate) => !candidate)) return [];
    const present = requirements as SkillCandidate[];
    const stage = present.reduce((lowest, candidate) => stageRank[candidate.stage] < stageRank[lowest] ? candidate.stage : lowest, present[0].stage);
    const evidenceDigests = [...new Set(present.flatMap((candidate) => candidate.sourceDigests))];
    return [{
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      stage,
      confidence: Math.round(present.reduce((sum, candidate) => sum + candidate.confidence, 0) / present.length),
      evidenceCount: Math.min(...present.map((candidate) => candidate.evidenceCount)),
      behavioralEvidenceCount: Math.min(...present.map((candidate) => candidate.behavioralEvidenceCount)),
      trigger: recipe.trigger,
      inputs: recipe.inputs,
      steps: recipe.steps,
      completionCriteria: recipe.completionCriteria,
      failureRules: recipe.failureRules,
      permissions: recipe.permissions,
      evidenceDigests,
      trainerConfirmed: false,
      trainerReview: "unreviewed" as const,
      provenance: { kind: "recipe" as const, version: 1 },
    }];
  }).sort((left, right) => stageRank[right.stage] - stageRank[left.stage] || right.confidence - left.confidence);
}

export function isCanonicalRecipeProcedure(procedure: ProceduralSkill) {
  const recipe = procedureRecipes.find((candidate) => candidate.id === procedure.id);
  if (!recipe || procedure.provenance?.kind !== "recipe" || procedure.provenance.version !== 1) return false;
  return procedure.name === recipe.name
    && procedure.description === recipe.description
    && procedure.trigger === recipe.trigger
    && JSON.stringify(procedure.inputs) === JSON.stringify(recipe.inputs)
    && JSON.stringify(procedure.steps) === JSON.stringify(recipe.steps)
    && JSON.stringify(procedure.completionCriteria) === JSON.stringify(recipe.completionCriteria)
    && JSON.stringify(procedure.failureRules) === JSON.stringify(recipe.failureRules)
    && JSON.stringify(procedure.permissions) === JSON.stringify(recipe.permissions);
}

function buildHatchReadiness(observations: PromptObservation[], candidates: SkillCandidate[]): HatchReadiness {
  const behavioralPrompts = observations.filter((observation) => observation.intent === "directive" || observation.intent === "personal-preference").length;
  const intentDiversity = new Set(observations.map((observation) => observation.intent)).size;
  const matureCandidates = candidates.filter((candidate) => stageRank[candidate.stage] >= stageRank.hypothesis).length;
  const rawScore = Math.min(100, Math.min(10, observations.length) * 3 + Math.min(6, behavioralPrompts) * 8 + intentDiversity * 2 + matureCandidates * 8);
  const reasons: string[] = [];
  if (observations.length < 5) reasons.push(`Needs ${5 - observations.length} more distinct prompt${5 - observations.length === 1 ? "" : "s"}.`);
  if (behavioralPrompts < 3) reasons.push(`Needs ${3 - behavioralPrompts} more behavioral example${3 - behavioralPrompts === 1 ? "" : "s"}.`);
  if (matureCandidates < 2) reasons.push(`Needs ${2 - matureCandidates} more repeated capability pattern${2 - matureCandidates === 1 ? "" : "s"}.`);
  const ready = observations.length >= 5 && behavioralPrompts >= 3 && matureCandidates >= 2 && rawScore >= 60;
  const score = ready ? rawScore : Math.min(89, rawScore);
  if (!reasons.length) reasons.push("Enough distinct behavioral evidence exists for a stable hatch profile.");
  return { ready, score, reasons, distinctPrompts: observations.length, behavioralPrompts, intentDiversity };
}

export function buildPromptprint(sources: TrainingSource[]): Promptprint {
  const observations = observeTrainingSources(sources);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const corpus = sources.filter((source) => source.kind !== "resource").map((source) => source.content).join("\n\n");
  const sampleCount = sources.filter((source) => source.kind !== "resource").length;
  const totalWords = Math.max(1, corpus.trim().split(/\s+/).length);
  const dimensions = Object.fromEntries((Object.keys(promptprintPatterns) as PromptprintKey[]).map((key) => {
    const weightedHits = observations.reduce((sum, observation) => sum + countMatches(sourceById.get(observation.sourceId)?.content ?? "", promptprintPatterns[key]) * observation.learningWeight, 0);
    const densityBonus = Math.min(14, Math.round((weightedHits / totalWords) * 700));
    return [key, clamp(28 + weightedHits * 5 + densityBonus)];
  })) as Record<PromptprintKey, number>;
  const ranked = (Object.entries(dimensions) as Array<[PromptprintKey, number]>).sort((a, b) => b[1] - a[1]);
  const styleTelemetry = [
    Math.round(totalWords / Math.max(1, sampleCount) / 10),
    (corpus.match(/\?/g) ?? []).length,
    (corpus.match(/:/g) ?? []).length,
    (corpus.match(/(?:^|\n)\s*[-*]/g) ?? []).length,
    (corpus.match(/\b[A-Z]{3,}\b/g) ?? []).length,
  ];
  const signatureSeed = `${(Object.keys(dimensions) as PromptprintKey[]).map((key) => Math.round(dimensions[key] / 4) * 4).join("|")}|${styleTelemetry.join("|")}`;
  const signature = hashText(signatureSeed).toString(16).toUpperCase().padStart(8, "0");
  const confidence = Math.min(96, Math.round(10 + Math.min(52, totalWords / 18) + Math.min(34, sampleCount * 5)));
  return {
    signature,
    confidence,
    sampleCount,
    archetype: buildPersonalArchetype(ranked[0][0], ranked[1][0], signatureSeed),
    dimensions,
    dominant: ranked[0][0],
    secondary: ranked[1][0],
    patterns: ranked.slice(0, 3).map(([key]) => promptprintMeta[key].copy),
  };
}

export function buildSkillCombinations(skills: LearnedSkill[]): SkillCombination[] {
  const learned = new Set(skills.filter((skill) => skill.evidence > 0).map((skill) => skill.id));
  return combinationRecipes.filter((recipe) => recipe.requires.every((skill) => learned.has(skill))).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    requires: recipe.requires,
    description: recipe.description,
    move: { id: `combo:${recipe.id}`, name: recipe.name, icon: recipe.icon, type: recipe.type, power: recipe.power, description: recipe.description },
  }));
}

export function mergeLearnedSkills(inherited: LearnedSkill[], acquired: LearnedSkill[], originTrainer: string, currentTrainer: string) {
  const ids = [...new Set([...inherited, ...acquired].map((skill) => skill.id))];
  return ids.map((id) => {
    const fromOrigin = inherited.find((skill) => skill.id === id);
    const fromCurrent = acquired.find((skill) => skill.id === id);
    const base = fromCurrent ?? fromOrigin;
    if (!base) throw new Error(`Missing skill ${id}`);
    return {
      ...base,
      evidence: (fromOrigin?.evidence ?? 0) + (fromCurrent?.evidence ?? 0),
      source: fromOrigin && fromCurrent
        ? `Inherited from ${originTrainer} + acquired from ${currentTrainer}`
        : fromOrigin ? `Inherited from ${originTrainer}` : `Acquired from ${currentTrainer}`,
    };
  }).sort((left, right) => right.evidence - left.evidence);
}

export function mergeLoops(inherited: AgentLoop[], acquired: AgentLoop[]) {
  const ids = [...new Set([...inherited, ...acquired].map((loop) => loop.id))];
  return ids.map((id) => {
    const fromOrigin = inherited.find((loop) => loop.id === id);
    const fromCurrent = acquired.find((loop) => loop.id === id);
    const base = fromCurrent ?? fromOrigin;
    if (!base) throw new Error(`Missing loop ${id}`);
    return { ...base, evidence: (fromOrigin?.evidence ?? 0) + (fromCurrent?.evidence ?? 0) };
  }).sort((left, right) => right.evidence - left.evidence).slice(0, 6);
}

export function buildCrossTrainerFusions(inherited: LearnedSkill[], acquired: LearnedSkill[], inheritedTrainer: string, acquiredTrainer: string): FusionMove[] {
  const pairs: Array<[LearnedSkill, LearnedSkill]> = [];
  const evidencedInherited = inherited.filter((skill) => skill.evidence > 0);
  const evidencedAcquired = acquired.filter((skill) => skill.evidence > 0);
  for (const originSkill of evidencedInherited.slice(0, 4)) {
    const currentSkill = evidencedAcquired.find((skill) => skill.id !== originSkill.id) ?? evidencedAcquired[0];
    if (currentSkill && !pairs.some(([left, right]) => left.id === originSkill.id && right.id === currentSkill.id)) pairs.push([originSkill, currentSkill]);
    if (pairs.length === 3) break;
  }
  return pairs.map(([originSkill, currentSkill]) => {
    const originWord = originSkill.name.split(/\s+/)[0];
    const currentWord = currentSkill.name.split(/\s+/).at(-1);
    return {
      id: `fusion:${originSkill.id}+${currentSkill.id}`,
      name: `${originWord} ${currentWord} Fusion`,
      type: originSkill.type === currentSkill.type ? originSkill.type : "NEXUS",
      power: Math.min(99, Math.round((originSkill.power + currentSkill.power) / 2) + 12),
      description: `Fuses ${originSkill.name} from ${inheritedTrainer} with ${currentSkill.name} learned from ${acquiredTrainer}.`,
      icon: "◇",
      inheritedSkillId: originSkill.id,
      acquiredSkillId: currentSkill.id,
      inheritedTrainer,
      acquiredTrainer,
      evidence: originSkill.evidence + currentSkill.evidence,
    };
  });
}

function buildLoops(scores: Record<SkillKey, number>): AgentLoop[] {
  const loops: AgentLoop[] = [];
  if (scores.loops + scores.critique > 1) loops.push({ id: "build-verify", name: "BUILD · VERIFY · RETRY", icon: "↻", trigger: "Output fails its quality gate", steps: ["Plan", "Execute", "Verify", "Retry or ship"], evidence: scores.loops + scores.critique });
  if (scores.web + scores.critique > 1) loops.push({ id: "research-proof", name: "RESEARCH PROOF LOOP", icon: "⌕", trigger: "A claim needs fresh evidence", steps: ["Search", "Open sources", "Cross-check", "Synthesize"], evidence: scores.web + scores.critique });
  if (scores.code + scores.tools > 1) loops.push({ id: "ship-loop", name: "AGENT SHIP LOOP", icon: "⌘", trigger: "A build task is assigned", steps: ["Inspect", "Patch", "Run checks", "Package"], evidence: scores.code + scores.tools });
  if (scores.delegation + scores.planning > 1) loops.push({ id: "swarm-loop", name: "PARALLEL SWARM LOOP", icon: "⋈", trigger: "Work splits into independent tracks", steps: ["Decompose", "Delegate", "Collect", "Reconcile"], evidence: scores.delegation + scores.planning });
  if (scores.memory > 1) loops.push({ id: "recall-loop", name: "CONTEXT RECALL LOOP", icon: "▤", trigger: "A known user or project returns", steps: ["Recall", "Confirm", "Respond", "Update memory"], evidence: scores.memory });
  return loops.sort((a, b) => b.evidence - a.evidence).slice(0, 4);
}

function frontmatterValue(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "mi"));
  return match?.[1]?.trim() ?? "";
}

export function parseSkillPackages(sources: TrainingSource[]): AgentSkillPackage[] {
  return sources.filter((source) => /(^|\/)skill\.md$/i.test(source.name) || source.kind === "skills").map((source) => {
    const match = source.content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    const frontmatter = match?.[1] ?? "";
    const instructions = (match?.[2] ?? source.content).trim();
    const folder = source.name.includes("/") ? source.name.split("/").slice(0, -1).join("/") : source.name.replace(/\.md$/i, "");
    const fallbackName = folder.split("/").filter(Boolean).pop() ?? "imported-skill";
    const resources = sources.filter((item) => item.id !== source.id && folder && item.name.startsWith(`${folder}/`)).map((item) => ({ path: item.name.slice(folder.length + 1), content: item.content }));
    return {
      name: frontmatterValue(frontmatter, "name") || fallbackName.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      description: frontmatterValue(frontmatter, "description") || instructions.split("\n").find((line) => line.trim() && !line.startsWith("#"))?.trim() || "Imported Agent Skill package",
      folder,
      instructions,
      resources,
      sourceFile: source.name,
    };
  });
}

export function analyzeTraining(sources: TrainingSource[], defaults: SkillKey[]) {
  const corpus = sources.map((source) => source.content).join("\n\n");
  const observations = observeTrainingSources(sources);
  return { ...analyzeObservations(observations, defaults), corpus, skillPackages: parseSkillPackages(sources) };
}

export function analyzeObservations(observations: PromptObservation[], defaults: SkillKey[]) {
  const skillCandidates = buildSkillCandidates(observations);
  const scores = Object.fromEntries((Object.keys(skillLibrary) as SkillKey[]).map((skill) => {
    const candidate = skillCandidates.find((item) => item.id === skill);
    return [skill, candidate?.behavioralEvidenceCount ?? 0];
  })) as Record<SkillKey, number>;
  const evidenced = skillCandidates
    .filter((candidate) => stageRank[candidate.stage] >= stageRank.hypothesis)
    .map((candidate) => ({ ...skillLibrary[candidate.id], evidence: candidate.behavioralEvidenceCount, source: `${candidate.stage} by Creation Engine V4` }));
  const learnedSkills = evidenced.length
    ? evidenced
    : defaults.map((skill) => ({ ...skillLibrary[skill], evidence: 0, source: "Seed capability; awaiting behavioral evidence" }));
  const proceduralSkills = buildProceduralSkills(skillCandidates);
  return {
    corpus: "",
    scores,
    learnedSkills,
    loops: buildLoops(scores),
    skillPackages: [],
    observations,
    decisionEpisodes: buildDecisionEpisodes(observations),
    behaviorHypotheses: buildBehaviorHypotheses(skillCandidates, observations),
    skillCandidates,
    proceduralSkills,
    hatchReadiness: buildHatchReadiness(observations, skillCandidates),
  };
}
