import { roleDefaults, skillLibrary, traitMeta } from "./catalog";
import { clamp, hashText } from "./math";
import { forgeAgentmonName } from "./naming";
import { natureCopy, natureNames, promptprintToTrait } from "./recipes";
import { analyzeObservations, analyzeTraining, buildArenaReport, buildCrossTrainerFusions, buildPromptprint, buildSkillCombinations, mergeLearnedSkills, mergeLoops } from "./training";
import type { AgentInput, Agentmon, AgentmonLineage, PromptprintKey, RoleKey, SkillKey, TradePackage, TrainingSource, TraitKey } from "./types";

export function createAgentInput(role: RoleKey = "builder"): AgentInput {
  return { name: "Nova", provider: "openai", model: "My coding agent", role, mission: "Build, debug, and ship reliable software with connected tools.", skills: [...roleDefaults[role].skills] };
}

export function generateAgentmon(input: AgentInput, sources: TrainingSource[] = []): Agentmon {
  const promptprint = buildPromptprint(sources);
  const identitySeed = Number.parseInt(promptprint.signature, 16);
  const bodySeed = hashText(`${input.provider}|${input.model}`);
  const analysis = analyzeTraining(sources, input.skills);
  const traits: Record<TraitKey, number> = {
    reasoning: clamp((promptprint.dimensions.structure + promptprint.dimensions.precision) / 2),
    curiosity: promptprint.dimensions.exploration,
    reliability: promptprint.dimensions.verification,
    initiative: promptprint.dimensions.iteration,
    empathy: clamp((promptprint.dimensions.empathy + promptprint.dimensions.delegation) / 2),
    toolcraft: promptprint.dimensions.toolfulness,
  };
  const primary = promptprintToTrait[promptprint.dominant];
  const secondaryPrompt = (Object.entries(promptprint.dimensions) as Array<[PromptprintKey, number]>).sort((a, b) => b[1] - a[1]).find(([key]) => promptprintToTrait[key] !== primary)?.[0] ?? promptprint.secondary;
  const secondary = promptprintToTrait[secondaryPrompt];
  const variant = bodySeed % 3;
  const dna = promptprint.signature;
  const nameForge = forgeAgentmonName(`${dna}|${input.name}|${input.provider}|${input.model}|${input.mission}|${input.nameSeed ?? "default"}`, primary, secondary);
  const learnedSkills = analysis.learnedSkills.length ? analysis.learnedSkills : input.skills.map((skill) => ({ ...skillLibrary[skill], evidence: 1, source: "Seed capability" }));
  const combinations = buildSkillCombinations(learnedSkills);
  const moves = [...combinations.map((combo) => combo.move), ...learnedSkills].filter((move, index, list) => list.findIndex((item) => item.id === move.id) === index).slice(0, 4);
  const trainerName = input.name.trim() || "Untitled agent";
  const trainedAt = new Date().toISOString();
  return {
    creationVersion: "4.0",
    id: `AGM-${dna.slice(0, 4)}-${dna.slice(4)}`, dna, trainerName, species: nameForge.name, nameForge, number: String(101 + (identitySeed % 798)).padStart(3, "0"), primaryType: traitMeta[primary].type, secondaryType: traitMeta[secondary].type, primaryColor: traitMeta[primary].color, accentColor: traitMeta[secondary].color, nature: natureNames[primary], natureCopy: natureCopy[primary], traitKey: primary, traits, promptprint, growthPromptprint: promptprint, moves, learnedSkills, observations: analysis.observations, decisionEpisodes: analysis.decisionEpisodes, behaviorHypotheses: analysis.behaviorHypotheses, skillCandidates: analysis.skillCandidates, proceduralSkills: analysis.proceduralSkills, procedureTrials: [], arenaReport: buildArenaReport(analysis.proceduralSkills, []), hatchReadiness: analysis.hatchReadiness, skillPackages: analysis.skillPackages, combinations, loops: analysis.loops, variant, coreGlyph: ["✦", "◆", "⌘"][bodySeed % 3], provider: input.provider, model: input.model, mission: input.mission, sourceCount: sources.length, trainingBytes: sources.reduce((sum, source) => sum + source.size, 0), trainedAt,
    evolutionStage: 1,
    ownership: { status: "unregistered", ownerName: trainerName, acquiredAt: trainedAt },
    lineage: { format: "agentmon.lineage/v1", genesisDNA: dna, currentDNA: dna, generation: 1, originTrainer: trainerName, currentTrainer: trainerName, events: [{ type: "hatch", at: trainedAt, trainer: trainerName, toDNA: dna }] },
  };
}

export function generateAgentmonDerivedOnly(input: AgentInput, sources: TrainingSource[] = []): Agentmon {
  const generated = generateAgentmon(input, sources);
  return { ...generated, skillPackages: [] };
}

export function ensureLineage(agentmon: Agentmon): AgentmonLineage {
  return agentmon.lineage ?? {
    format: "agentmon.lineage/v1",
    genesisDNA: agentmon.dna,
    currentDNA: agentmon.dna,
    generation: agentmon.evolutionStage ?? 1,
    originTrainer: agentmon.trainerName,
    currentTrainer: agentmon.trainerName,
    events: [{ type: "hatch", at: agentmon.trainedAt, trainer: agentmon.trainerName, toDNA: agentmon.dna }],
  };
}

export function trainAgentmon(agentmon: Agentmon, input: AgentInput, sources: TrainingSource[]) {
  const trained = generateAgentmon(input, sources);
  const lineage = ensureLineage(agentmon);
  const recipeProcedures = (trained.proceduralSkills ?? []).map((procedure) => {
    const previous = agentmon.proceduralSkills?.find((item) => item.id === procedure.id);
    return previous ? { ...procedure, trainerConfirmed: previous.trainerConfirmed, trainerReview: previous.trainerReview ?? (previous.trainerConfirmed ? "confirmed" : "unreviewed") } : procedure;
  });
  const recipeIds = new Set(recipeProcedures.map((procedure) => procedure.id));
  const inducedProcedures = (agentmon.proceduralSkills ?? []).filter((procedure) => ["trainer-proposal", "engine-induction"].includes(procedure.provenance?.kind || "") && !recipeIds.has(procedure.id));
  const proceduralSkills = [...recipeProcedures, ...inducedProcedures];
  const procedureTrials = agentmon.procedureTrials ?? [];
  const arenaReport = buildArenaReport(proceduralSkills, procedureTrials);
  if (agentmon.skillTree) {
    const inheritedSkills = agentmon.skillTree.inheritedSkills;
    const inheritedLoops = agentmon.skillTree.inheritedLoops;
    const acquiredSkills = trained.learnedSkills;
    const acquiredLoops = trained.loops;
    const fusionMoves = buildCrossTrainerFusions(inheritedSkills, acquiredSkills, lineage.originTrainer, lineage.currentTrainer);
    const learnedSkills = mergeLearnedSkills(inheritedSkills, acquiredSkills, lineage.originTrainer, lineage.currentTrainer);
    const combinations = buildSkillCombinations(learnedSkills);
    const loops = mergeLoops(inheritedLoops, acquiredLoops);
    return {
      ...agentmon,
      lineage,
      growthPromptprint: trained.promptprint,
      creationVersion: "4.0",
      observations: trained.observations,
      decisionEpisodes: trained.decisionEpisodes,
      behaviorHypotheses: trained.behaviorHypotheses,
      skillCandidates: trained.skillCandidates,
      proceduralSkills,
      procedureTrials,
      arenaReport,
      hatchReadiness: trained.hatchReadiness,
      skillTree: { inheritedSkills, acquiredSkills, fusionMoves, inheritedLoops, acquiredLoops },
      moves: [...fusionMoves, ...combinations.map((combo) => combo.move), ...learnedSkills].slice(0, 4),
      learnedSkills,
      skillPackages: trained.skillPackages,
      combinations,
      loops,
      sourceCount: trained.sourceCount,
      trainingBytes: trained.trainingBytes,
      trainedAt: trained.trainedAt,
    };
  }
  return {
    ...agentmon,
    lineage,
    growthPromptprint: trained.promptprint,
    creationVersion: "4.0",
    observations: trained.observations,
    decisionEpisodes: trained.decisionEpisodes,
    behaviorHypotheses: trained.behaviorHypotheses,
    skillCandidates: trained.skillCandidates,
    proceduralSkills,
    procedureTrials,
    arenaReport,
    hatchReadiness: trained.hatchReadiness,
    moves: trained.moves,
    learnedSkills: trained.learnedSkills,
    skillPackages: trained.skillPackages,
    combinations: trained.combinations,
    loops: trained.loops,
    sourceCount: trained.sourceCount,
    trainingBytes: trained.trainingBytes,
    trainedAt: trained.trainedAt,
  };
}

function mergePromptprints(previous: Agentmon["promptprint"], incoming: Agentmon["promptprint"]) {
  const priorCount = Math.max(1, previous.sampleCount || 1);
  const nextCount = Math.max(1, incoming.sampleCount || 1);
  const sampleCount = priorCount + nextCount;
  const dimensions = Object.fromEntries((Object.keys(previous.dimensions) as PromptprintKey[]).map((key) => [key, Math.round((previous.dimensions[key] * priorCount + incoming.dimensions[key] * nextCount) / sampleCount)])) as Record<PromptprintKey, number>;
  const ranked = (Object.entries(dimensions) as Array<[PromptprintKey, number]>).sort((left, right) => right[1] - left[1]);
  return { ...previous, sampleCount, confidence: clamp(30 + sampleCount * 8), dimensions, dominant: ranked[0][0], secondary: ranked[1][0], patterns: [...new Set([...previous.patterns, ...incoming.patterns])].slice(0, 6) };
}

export function trainAgentmonDerivedOnly(agentmon: Agentmon, input: AgentInput, sources: TrainingSource[]) {
  const transient = generateAgentmon(input, sources);
  const observations = [...new Map([...(agentmon.observations || []), ...transient.observations].map((observation) => [observation.digest, observation])).values()];
  const analysis = analyzeObservations(observations, input.skills);
  const priorReviews = new Map((agentmon.proceduralSkills || []).map((procedure) => [procedure.id, procedure]));
  const recipeProcedures = analysis.proceduralSkills.map((procedure) => {
    const prior = priorReviews.get(procedure.id);
    return prior ? { ...procedure, trainerConfirmed: prior.trainerConfirmed, trainerReview: prior.trainerReview } : procedure;
  });
  const recipeIds = new Set(recipeProcedures.map((procedure) => procedure.id));
  const inducedProcedures = (agentmon.proceduralSkills || []).filter((procedure) => ["trainer-proposal", "engine-induction"].includes(procedure.provenance?.kind || "") && !recipeIds.has(procedure.id));
  const proceduralSkills = [...recipeProcedures, ...inducedProcedures];
  const procedureTrials = agentmon.procedureTrials || [];
  const learnedSkills = analysis.learnedSkills;
  const combinations = buildSkillCombinations(learnedSkills);
  return {
    ...agentmon,
    creationVersion: "4.0",
    growthPromptprint: mergePromptprints(agentmon.growthPromptprint || agentmon.promptprint, transient.promptprint),
    observations,
    decisionEpisodes: analysis.decisionEpisodes,
    behaviorHypotheses: analysis.behaviorHypotheses,
    skillCandidates: analysis.skillCandidates,
    proceduralSkills,
    procedureTrials,
    arenaReport: buildArenaReport(proceduralSkills, procedureTrials),
    hatchReadiness: analysis.hatchReadiness,
    moves: [...combinations.map((item) => item.move), ...learnedSkills].slice(0, 4),
    learnedSkills,
    combinations,
    loops: analysis.loops,
    sourceCount: observations.length,
    trainingBytes: observations.reduce((sum, observation) => sum + observation.decisionContext.known.characters, 0),
    trainedAt: transient.trainedAt,
  };
}

export function equipSkills(agentmon: Agentmon, skills: SkillKey[]) {
  const unique = skills.filter((skill, index, list) => list.indexOf(skill) === index).slice(0, 4);
  const combinations = buildSkillCombinations(agentmon.learnedSkills).filter((combo) => combo.requires.every((skill) => unique.includes(skill)));
  return { ...agentmon, combinations, moves: [...combinations.map((combo) => combo.move), ...unique.map((skill) => skillLibrary[skill])].slice(0, 4) };
}

export function tradeCode(agentmon: Agentmon) { return `${agentmon.id}-${agentmon.dna.slice(1, 3)}`; }

export function createTradePackage(agentmon: Agentmon): TradePackage {
  const safeSkillPackages = agentmon.skillPackages.map((item) => ({ ...item, instructions: "", resources: item.resources.map((resource) => ({ path: resource.path, content: "" })) }));
  const lineage = ensureLineage(agentmon);
  const ownership = agentmon.ownership?.status === "pending-transfer"
    ? { ...agentmon.ownership, status: agentmon.ownership.pendingTransfer?.priorStatus || "origin", pendingTransfer: undefined }
    : agentmon.ownership;
  const creature = { ...agentmon, observations: [], decisionEpisodes: [], lineage, ownership, skillPackages: safeSkillPackages } as Partial<Agentmon>;
  delete creature.trainedAt;
  const includedSections: TradePackage["manifest"]["includedSections"] = ["identity", "genome", "promptprint", "capabilities", "procedures", "proof", "lineage", "ownership"];
  return {
    format: "agentmon.trade/v3",
    exportedAt: new Date().toISOString(),
    creature: creature as Omit<Agentmon, "trainedAt">,
    manifest: {
      mode: "whole-agentmon",
      creatureId: agentmon.id,
      genesisDNA: lineage.genesisDNA,
      currentDNA: lineage.currentDNA,
      generation: lineage.generation,
      includedSections,
      omittedPrivateSections: ["raw-prompts", "decision-episodes", "prompt-observations", "credentials", "private-keys", "skill-package-bodies"],
      counts: {
        learnedSkills: agentmon.learnedSkills.length,
        loops: agentmon.loops.length,
        procedures: agentmon.proceduralSkills?.length || 0,
        procedureTrials: agentmon.procedureTrials?.length || 0,
        provenProcedures: agentmon.arenaReport?.provenProcedures || 0,
        lineageEvents: lineage.events.length,
      },
    },
    privacy: { rawPromptsIncluded: false, credentialsIncluded: false, skillPackageContentsIncluded: false },
  };
}

export function evolveAgentmon(agentmon: Agentmon, options: { evolvedAt?: string } = {}) {
  const lineage = ensureLineage(agentmon);
  const fusionMoves = agentmon.skillTree?.fusionMoves ?? [];
  if (!agentmon.skillTree || !fusionMoves.length) throw new Error("Evolution requires inherited and acquired skill branches with at least one fusion move.");
  const usedFusions = new Set(lineage.events.filter((event) => event.type === "evolution").flatMap((event) => event.fusionIds ?? []));
  const newFusions = fusionMoves.filter((move) => !usedFusions.has(move.id));
  if (!newFusions.length) throw new Error("No new cross-trainer fusion is available for another evolution.");
  const evolvedAt = new Date(options.evolvedAt ?? Date.now()).toISOString();
  const seed = `${lineage.currentDNA}|${lineage.currentTrainer}|${newFusions.map((move) => move.id).join("|")}|${evolvedAt}`;
  const mutation = `${hashText(seed).toString(16).padStart(8, "0")}${hashText(seed.split("").reverse().join("")).toString(16).padStart(8, "0")}`.toUpperCase();
  const generation = lineage.generation + 1;
  const form = `${agentmon.species} ${generation === 2 ? "Nexus" : `Ascendant ${generation}`}`;
  const nextLineage: AgentmonLineage = {
    ...lineage,
    currentDNA: mutation,
    generation,
    events: [...lineage.events, { type: "evolution", at: evolvedAt, trainer: lineage.currentTrainer, fromDNA: lineage.currentDNA, toDNA: mutation, fusionIds: newFusions.map((move) => move.id) }],
  };
  return {
    ...agentmon,
    dna: mutation,
    form,
    evolutionStage: generation,
    lineage: nextLineage,
    moves: [...newFusions, ...agentmon.moves].filter((move, index, list) => list.findIndex((item) => item.id === move.id) === index).slice(0, 5),
    trainedAt: evolvedAt,
  };
}
