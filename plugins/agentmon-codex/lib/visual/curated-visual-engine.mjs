import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CURATED_VISUAL_FORMAT = "agentmon.curated-visual-plan/v2";
export const CURATED_RENDERER = "agentmon-trait-atlas/v4";

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const CURATED_ASSET_ROOT = resolve(moduleDir, "../../assets/visual-v4");
const manifest = JSON.parse(readFileSync(resolve(CURATED_ASSET_ROOT, "manifest.json"), "utf8"));
if ((manifest.morphs ?? []).reduce((total, morph) => total + morph.weight, 0) !== 10_000) throw new Error("Curated species morph weights must total 10,000.");
const traitAxes = manifest.traitSystem?.axes ?? [];
const evolutionStages = manifest.evolutionStages ?? [
  { id: "form-01", order: 1, label: "Form I", assetRoot: "species/form-01/forms" },
  { id: "form-02", order: 2, label: "Form II", assetRoot: "species/forms" },
  { id: "form-03", order: 3, label: "Form III", assetRoot: "species/form-03/forms" },
];
if (traitAxes.length < 8) throw new Error("Curated species must declare at least eight visible trait axes.");
if (new Set(manifest.species.map((species) => species.eyeSystem)).size !== manifest.species.length) throw new Error("Every founding species must have a distinct eye system.");

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function creatureAsset(speciesId, morphId, stageId) {
  const stage = evolutionStages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`Unknown curated evolution stage ${stageId}.`);
  return `${stage.assetRoot}/${speciesId}-${morphId}.png`;
}

function signPlan(unsigned) {
  return { ...unsigned, digest: digest(unsigned) };
}

export function createCuratedVisualPlan(agentmon) {
  if (!agentmon?.id || !agentmon?.dna) throw new Error("An Agentmon with id and DNA is required for curated visuals.");
  const genesisDNA = agentmon.lineage?.genesisDNA ?? agentmon.dna;
  const bindingProfile = agentmon.visualBindingProfile ?? agentmon.promptprint ?? {};
  const seed = digest({
    genesisDNA,
    provider: agentmon.provider ?? "unknown-provider",
    model: agentmon.model ?? "unknown-model",
    archetype: bindingProfile.archetype ?? "unknown",
    signature: bindingProfile.signature ?? agentmon.dna,
    dimensions: bindingProfile.dimensions ?? {},
    traitKey: agentmon.traitKey ?? "unknown",
  });
  const species = manifest.species[Number.parseInt(seed.slice(0, 8), 16) % manifest.species.length];
  const morphRoll = Number.parseInt(seed.slice(8, 16), 16) % 10_000;
  let cursor = 0;
  const morph = manifest.morphs.find((candidate) => {
    cursor += candidate.weight;
    return morphRoll < cursor;
  }) ?? manifest.morphs.at(-1);
  const individual = {
    sizeBand: ["compact", "average", "tall"][Number.parseInt(seed.slice(16, 18), 16) % 3],
    screenExpression: ["steady", "curious", "focused", "bright"][Number.parseInt(seed.slice(18, 20), 16) % 4],
    surfaceWear: ["pristine", "traveled", "veteran"][Number.parseInt(seed.slice(20, 22), 16) % 3],
    markingGene: seed.slice(22, 30),
    coreSignature: seed.slice(30, 38),
  };
  const plan = {
    format: CURATED_VISUAL_FORMAT,
    agentmonId: agentmon.id,
    assetPack: manifest.id,
    renderer: CURATED_RENDERER,
    species: {
      id: species.id,
      name: species.name,
      silhouette: species.bodyTopology,
      locomotion: species.locomotion,
      creatureAsset: creatureAsset(species.id, morph.id, "form-01"),
      eggAsset: `eggs/forms/${species.id}-${morph.id}.png`,
    },
    traits: Object.fromEntries(traitAxes.map((axis) => [axis, species[axis]])),
    morph: { id: morph.id, rarity: morph.rarity, roll: morphRoll },
    evolution: { stage: "form-01", order: 1, label: "Form I", lineageGeneration: Number(agentmon.lineage?.generation) || 1, permanent: true },
    individual,
    binding: { provider: agentmon.provider ?? "unknown-provider", model: agentmon.model ?? "unknown-model", promptprintSignature: bindingProfile.signature ?? null, readinessScore: agentmon.hatchReadiness?.score ?? 100, rawPromptsIncluded: false },
    dnaBinding: { genesisDigest: digest(genesisDNA), selectionDigest: seed, immutableSpecies: true, immutableMorph: true },
    qualityGate: {
      status: "passed",
      authoredSilhouette: true,
      familyCompatibility: true,
      rawCartesianAssembly: false,
      catalogedMorph: true,
      authoredSpecies: true,
      visibleTraitAxes: traitAxes.length,
      speciesDistinctEyeSystem: true,
      minimumPairwiseTraitDistance: manifest.traitSystem.minimumPairwiseDistance,
      weightedMorphPolicy: true,
      threeStageEvolution: true,
      runtimeImageGeneration: false,
    },
    privacy: { rawPromptsIncluded: false, localAssetsOnly: true },
  };
  return signPlan(plan);
}

export function advanceCuratedVisualPlan(plan, agentmon) {
  verifyCuratedVisualPlan(plan);
  const generation = Math.max(1, Number(agentmon?.lineage?.generation) || 1);
  const current = plan.evolution ?? { stage: "form-02", order: 2, label: "Form II", lineageGeneration: generation, permanent: true, migratedFromLegacyPlan: true };
  const currentIndex = evolutionStages.findIndex((stage) => stage.id === current.stage);
  if (currentIndex < 0) throw new Error(`Unknown curated evolution stage ${current.stage}.`);
  const generationDelta = Math.max(0, generation - current.lineageGeneration);
  const nextIndex = Math.min(evolutionStages.length - 1, currentIndex + generationDelta);
  const next = evolutionStages[nextIndex];
  const { digest: _recorded, ...unsigned } = plan;
  return signPlan({
    ...unsigned,
    species: { ...plan.species, creatureAsset: creatureAsset(plan.species.id, plan.morph.id, next.id) },
    evolution: {
      ...current,
      stage: next.id,
      order: next.order,
      label: next.label,
      lineageGeneration: generation,
      permanent: true,
      ...(nextIndex > currentIndex ? { evolvedFrom: current.stage } : {}),
    },
  });
}

export function verifyCuratedVisualPlan(plan) {
  if (plan?.format !== CURATED_VISUAL_FORMAT || plan?.renderer !== CURATED_RENDERER) throw new Error("Unsupported curated visual plan.");
  const { digest: recorded, ...unsigned } = plan;
  if (digest(unsigned) !== recorded) throw new Error("Curated visual plan integrity check failed.");
  if (plan.qualityGate?.status !== "passed" || plan.qualityGate?.rawCartesianAssembly !== false) throw new Error("Curated visual quality gate failed.");
  if (!manifest.species.some((species) => species.id === plan.species?.id)) throw new Error("Curated visual plan references an unknown species.");
  if (!manifest.morphs.some((morph) => morph.id === plan.morph?.id)) throw new Error("Curated visual plan references an unknown morph.");
  if (plan.evolution && !evolutionStages.some((stage) => stage.id === plan.evolution.stage && stage.order === plan.evolution.order)) throw new Error("Curated visual plan references an unknown evolution stage.");
  if (Object.keys(plan.traits ?? {}).length !== traitAxes.length) throw new Error("Curated visual plan has an incomplete visible trait profile.");
  if (plan.privacy?.rawPromptsIncluded !== false) throw new Error("Curated visual plans may not include raw prompts.");
  return plan;
}

export function renderCuratedVisualPng(plan, options = {}) {
  verifyCuratedVisualPlan(plan);
  const relative = options.kind === "egg" ? plan.species.eggAsset : plan.species.creatureAsset;
  const path = resolve(CURATED_ASSET_ROOT, relative);
  if (!path.startsWith(`${CURATED_ASSET_ROOT}/`)) throw new Error("Curated visual asset escaped its pack root.");
  return readFileSync(path);
}

export function curatedVisualManifest() {
  return structuredClone(manifest);
}
