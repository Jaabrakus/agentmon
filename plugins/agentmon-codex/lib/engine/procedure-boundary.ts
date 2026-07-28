import { verifyEngineInduction } from "../semantics/semantic-induction.mjs";
import { buildArenaReport, isCanonicalRecipeProcedure, stageRank } from "./training";
import type { Agentmon, ProceduralSkill } from "./types";

export type ProcedureBoundaryReason =
  | "noncanonical-procedure"
  | "insufficient-stage"
  | "trainer-unconfirmed"
  | "arena-unproven"
  | "effectiveness-regressed";

export type ProcedureBoundaryDecision = {
  eligible: boolean;
  reasons: ProcedureBoundaryReason[];
  arenaStatus: "untested" | "testing" | "proven" | "regressed";
  provenance: "recipe" | "engine-induction" | "untrusted";
};

function effectivenessStatus(agentmon: Agentmon, procedureId: string) {
  const report = agentmon.effectivenessReport as { procedures?: Array<{ procedureId: string; status: string }> } | undefined;
  return report?.procedures?.find((result) => result.procedureId === procedureId)?.status ?? "insufficient";
}

function verifiedArenaStatus(agentmon: Agentmon, procedure: ProceduralSkill) {
  return buildArenaReport([procedure], agentmon.procedureTrials ?? []).results[0]?.status ?? "untested";
}

export function canonicalProcedureProvenance(procedure: ProceduralSkill): ProcedureBoundaryDecision["provenance"] {
  if (isCanonicalRecipeProcedure(procedure)) return "recipe";
  if (verifyEngineInduction(procedure)) return "engine-induction";
  return "untrusted";
}

export function evaluateProcedureBoundary(agentmon: Agentmon, procedure: ProceduralSkill, options: { allowTesting?: boolean } = {}): ProcedureBoundaryDecision {
  const reasons: ProcedureBoundaryReason[] = [];
  const provenance = canonicalProcedureProvenance(procedure);
  const arenaStatus = verifiedArenaStatus(agentmon, procedure);
  if (provenance === "untrusted") reasons.push("noncanonical-procedure");
  if (stageRank[procedure.stage] < stageRank.validated) reasons.push("insufficient-stage");
  if (!procedure.trainerConfirmed || procedure.trainerReview !== "confirmed") reasons.push("trainer-unconfirmed");
  if (!options.allowTesting && arenaStatus !== "proven") reasons.push("arena-unproven");
  if (effectivenessStatus(agentmon, procedure.id) === "regressed") reasons.push("effectiveness-regressed");
  return { eligible: reasons.length === 0, reasons, arenaStatus, provenance };
}

export function canonicalProcedures(agentmon: Agentmon) {
  return (agentmon.proceduralSkills ?? []).filter((procedure) => canonicalProcedureProvenance(procedure) !== "untrusted");
}

export function executableProcedures(agentmon: Agentmon, options: { allowTesting?: boolean } = {}) {
  return canonicalProcedures(agentmon).filter((procedure) => evaluateProcedureBoundary(agentmon, procedure, options).eligible);
}
