import type { ProcedureRoutingPolicy } from "./types";

function boundedPhrases(values: unknown, label: string, maximum: number): string[] {
  if (!Array.isArray(values) || values.length > maximum) throw new Error(`${label} must contain at most ${maximum} phrases.`);
  const phrases = [...new Set(values.map((value) => String(value || "").trim().toLowerCase()))];
  if (phrases.some((value) => !value || value.length > 120)) throw new Error(`${label} phrases must contain 1-120 characters.`);
  return phrases;
}

export function validateProcedureRoutingPolicy(input: unknown): ProcedureRoutingPolicy | undefined {
  if (input == null) return undefined;
  if (!input || typeof input !== "object" || (input as { version?: unknown }).version !== 1) throw new Error("Procedure routing policy must use version 1.");
  const source = input as Record<string, unknown>;
  const groups = source.requiredConceptGroups == null ? [] : source.requiredConceptGroups;
  if (!Array.isArray(groups) || groups.length > 6) throw new Error("Procedure routing policy supports at most six required concept groups.");
  const requiredConceptGroups = groups.map((group, index) => boundedPhrases(group, `Routing concept group ${index + 1}`, 12));
  if (requiredConceptGroups.some((group) => !group.length)) throw new Error("Routing concept groups cannot be empty.");
  const excludedConcepts = source.excludedConcepts == null ? [] : boundedPhrases(source.excludedConcepts, "Routing exclusions", 24);
  const minimumMatchedConcepts = Math.max(1, Math.min(12, Math.round(Number(source.minimumMatchedConcepts) || 1)));
  const minimumRelevance = Math.max(1, Math.min(100, Math.round(Number(source.minimumRelevance) || 1)));
  return { version: 1, requiredConceptGroups, excludedConcepts, minimumMatchedConcepts, minimumRelevance };
}
