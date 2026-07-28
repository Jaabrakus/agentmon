import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function readAgentmonStatus(rootDir, engineRoot, slot) {
  try {
    const state = JSON.parse(await readFile(resolve(rootDir, ".agentmon/roster", slot, "agentmon.json"), "utf8"));
    const { visualLifecycle } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/visual/incubation-lifecycle.mjs")).href);
    const lifecycle = visualLifecycle(state);
    let species = null;
    let evolution = null;
    if (lifecycle.speciesBound) {
      try {
        const plan = JSON.parse(await readFile(resolve(rootDir, ".agentmon/roster", slot, "visual/curated-plan.json"), "utf8"));
        species = plan.species;
        evolution = plan.evolution ?? { stage: "form-02", order: 2, label: "Form II", permanent: true, migratedFromLegacyPlan: true };
      } catch {}
    }
    return {
      id: state.id,
      name: lifecycle.hatched ? (state.form ?? state.species) : lifecycle.label,
      readiness: lifecycle.score,
      stage: lifecycle.stage,
      brightness: lifecycle.brightness,
      species,
      evolution,
      stats: {
        skills: state.learnedSkills?.length ?? 0,
        procedures: state.proceduralSkills?.length ?? 0,
        promptSamples: state.promptprint?.sampleCount ?? 0,
        promptConfidence: state.promptprint?.confidence ?? 0,
        arenaTested: state.arenaReport?.testedProcedures ?? 0,
        arenaProven: state.arenaReport?.provenProcedures ?? 0,
        lineageGeneration: state.lineage?.generation ?? 1,
        outcomes: state.effectivenessReport?.totalOutcomes ?? 0,
        effectivenessScore: state.effectivenessReport?.averageScore ?? 0,
        beneficialProcedures: state.effectivenessReport?.beneficialProcedures ?? 0,
        regressedProcedures: state.effectivenessReport?.regressedProcedures ?? 0,
      },
    };
  } catch {
    return { id: null, name: "UNBOUND SIGNAL", readiness: 0, stage: "signal", brightness: 8, species: null };
  }
}

export async function createDownlink(rootDir, engineRoot, slot) {
  const state = JSON.parse(await readFile(resolve(rootDir, ".agentmon/roster", slot, "agentmon.json"), "utf8"));
  const status = await readAgentmonStatus(rootDir, engineRoot, slot);
  const { routeContext } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/runtime/v4-learning-service.mjs")).href);
  const routed = await routeContext({
    rootDir,
    agentmons: [{ ...state, slot }],
    query: "",
    allowedPermissions: [],
    advisoryMode: true,
    includeIdentityFallback: true,
    minimumScore: 0,
    allowTesting: false,
    maxAgentmons: 1,
    maxProcedures: 4,
  });
  if (!routed?.selected) throw new Error(`No Agentmon identity is available in slot '${slot}'.`);
  return {
    format: "agentmon.downlink/v3",
    slot,
    agentmon: { id: state.id, name: status.name, species: status.species, evolution: status.evolution },
    procedures: routed.selected.procedures,
    identity: routed.selected.identity,
    packet: routed.packet,
    routing: routed.routing,
    privacy: {
      rawPromptsIncluded: false,
      derivedIdentityIncluded: true,
      provenProceduresOnly: true,
      toolPermissionsGrantedByAgentmon: false,
      storedByAgentmonCloud: false,
      sentToActiveModelProvider: true,
    },
  };
}

export async function createAutomaticDownlink(rootDir, engineRoot, slot, query) {
  const state = JSON.parse(await readFile(resolve(rootDir, ".agentmon/roster", slot, "agentmon.json"), "utf8"));
  const { routeContext } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/runtime/v4-learning-service.mjs")).href);
  const routed = await routeContext({
    rootDir,
    agentmons: [{ ...state, slot }],
    query,
    allowedPermissions: [],
    advisoryMode: true,
    includeIdentityFallback: true,
    allowTesting: false,
    maxAgentmons: 1,
    maxProcedures: 4,
  });
  if (!routed?.selected) return null;
  const status = await readAgentmonStatus(rootDir, engineRoot, slot);
  return {
    format: "agentmon.downlink/v3",
    slot,
    agentmon: { id: state.id, name: status.name, species: status.species, evolution: status.evolution },
    procedures: routed.selected.procedures,
    identity: routed.selected.identity,
    packet: routed.packet,
    queryDigest: routed.queryDigest,
    routing: routed.routing,
    privacy: {
      rawPromptsIncluded: false,
      rawPromptsStored: false,
      derivedIdentityIncluded: true,
      provenProceduresOnly: true,
      toolPermissionsGrantedByAgentmon: false,
      storedByAgentmonCloud: false,
      sentToActiveModelProvider: true,
    },
  };
}
