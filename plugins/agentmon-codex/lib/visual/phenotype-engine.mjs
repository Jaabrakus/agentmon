import { createHash } from "node:crypto";
import { HARMONY_MODES, PALETTE_FAMILIES, resolvePalette } from "./palette-engine.mjs";

export const PHENOTYPE_FORMAT = "agentmon.phenotype/v2";

export const VISUAL_PARTS = {
  bodies: ["round", "square", "diamond", "bean", "shield", "moth", "orb", "totem", "hopper", "drake"],
  eyes: ["dot", "visor", "bright", "sleepy", "split", "cyclops", "star", "ring", "mask", "prism"],
  ears: ["none", "round", "point", "antenna", "fin", "horn", "leaf", "radar", "wing", "crystal"],
  tails: ["none", "spark", "cable", "leaf", "blade", "comet", "orb", "fan", "spring", "rune"],
  markings: ["none", "chevron", "freckles", "circuit", "stripe", "constellation", "split", "mask", "spiral", "patch"],
  coreGlyphs: ["spark", "diamond", "loop", "cross", "eye", "gate", "moon", "bolt", "seed", "crown"],
  limbs: ["boots", "paws", "spikes", "fins", "hover", "claws"],
  stances: ["compact", "tall", "wide"],
};

export function visualCombinationSpace() {
  const structural = Object.values(VISUAL_PARTS).reduce((total, values) => total * values.length, 1);
  return {
    structural,
    palettes: PALETTE_FAMILIES.length,
    harmonies: HARMONY_MODES.length,
    handedness: 2,
    baseCombinations: structural * PALETTE_FAMILIES.length * HARMONY_MODES.length * 2,
    excludes: ["equipment combinations", "evolution mutations", "animation frames"],
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function visualDigest(value) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function byte(seed, index) {
  return Number.parseInt(seed.slice((index * 2) % 62, (index * 2) % 62 + 2), 16);
}

function pick(items, seed, index) {
  return items[byte(seed, index) % items.length];
}

function provenSkillIds(agentmon) {
  const results = new Map((agentmon.arenaReport?.results ?? []).map((result) => [result.procedureId, result.status]));
  return (agentmon.proceduralSkills ?? [])
    .filter((procedure) => procedure.trainerReview === "confirmed" && results.get(procedure.id) === "proven")
    .map((procedure) => procedure.id)
    .sort();
}

function equipmentFor(skillIds, seed) {
  const slots = ["crown", "pack", "focus-lens", "tool-band", "map-ribbon", "shield-node"];
  return skillIds.slice(0, 3).map((procedureId, index) => ({
    slot: slots[byte(seed, 12 + index) % slots.length],
    procedureId,
    proofBound: true,
  }));
}

function lineageOf(agentmon) {
  return agentmon.lineage ?? {
    genesisDNA: agentmon.dna,
    currentDNA: agentmon.dna,
    generation: agentmon.evolutionStage ?? 1,
  };
}

export function createPhenotype(agentmon, options = {}) {
  if (!agentmon?.id || !agentmon?.dna) throw new Error("An Agentmon with an id and DNA is required.");
  const lineage = lineageOf(agentmon);
  const identitySeed = visualDigest(`${lineage.genesisDNA}|${agentmon.promptprint?.archetype ?? "unknown"}|${agentmon.traitKey ?? "unknown"}`);
  const formSeed = visualDigest(`${identitySeed}|${lineage.currentDNA}|${lineage.generation}`);
  const skillIds = provenSkillIds(agentmon);

  const generatedIdentity = {
    body: pick(VISUAL_PARTS.bodies, identitySeed, 0),
    eyes: pick(VISUAL_PARTS.eyes, identitySeed, 1),
    ears: pick(VISUAL_PARTS.ears, identitySeed, 2),
    tail: pick(VISUAL_PARTS.tails, identitySeed, 3),
    marking: pick(VISUAL_PARTS.markings, identitySeed, 4),
    coreGlyph: pick(VISUAL_PARTS.coreGlyphs, identitySeed, 5),
    limbs: pick(VISUAL_PARTS.limbs, identitySeed, 6),
    stance: pick(VISUAL_PARTS.stances, identitySeed, 7),
    handedness: byte(identitySeed, 8) % 2 === 0 ? "left" : "right",
  };
  const identity = Object.fromEntries(Object.entries(generatedIdentity).map(([key, value]) => [key, options.identityOverride?.[key] ?? value]));
  const palette = resolvePalette(identitySeed, {
    paletteId: agentmon.visualPreferences?.paletteId,
    harmony: agentmon.visualPreferences?.harmony,
    sourceColors: { primary: agentmon.primaryColor, accent: agentmon.accentColor },
  });
  const mutation = {
    generation: Math.max(1, Number(lineage.generation) || 1),
    aura: ["none", "pixels", "orbit", "flare"][Math.min(3, Math.max(0, (Number(lineage.generation) || 1) - 1))],
    crestSize: Math.min(3, Math.max(0, (Number(lineage.generation) || 1) - 1)),
    mutationMark: pick(VISUAL_PARTS.markings.slice(1), formSeed, 9),
  };
  const phenotype = {
    format: PHENOTYPE_FORMAT,
    agentmonId: agentmon.id,
    species: agentmon.species,
    form: agentmon.form ?? agentmon.species,
    genome: {
      genesisDNA: lineage.genesisDNA,
      currentDNA: lineage.currentDNA,
      generation: mutation.generation,
    },
    identity,
    palette,
    mutation,
    equipment: equipmentFor(skillIds, formSeed),
    rendering: { renderer: "agentmon-premium-pixel/v1", grid: 64, pixelScale: 2, transparency: true, lighting: "top-left-five-tone" },
    privacy: { rawPromptsIncluded: false, hiddenReasoningIncluded: false },
  };
  return { ...phenotype, digest: visualDigest(phenotype) };
}

export function verifyPhenotype(phenotype) {
  if (phenotype?.format !== PHENOTYPE_FORMAT) throw new Error("Unsupported phenotype format.");
  const { digest, ...unsigned } = phenotype;
  if (visualDigest(unsigned) !== digest) throw new Error("Phenotype integrity check failed.");
  if (phenotype.privacy?.rawPromptsIncluded !== false) throw new Error("Phenotypes may not include raw prompts.");
  return phenotype;
}
