import { createHash } from "node:crypto";
import { executableProcedures as boundaryEligibleProcedures } from "../agentmon-engine.mjs";
import { compileAgentmonIdentity, renderIdentityLines, safeIdentityText } from "./identity-compiler.mjs";
import { evaluateProcedureMatch, routingAudit } from "./routing-policy.mjs";

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function effectivenessStatus(agentmon, procedureId) {
  return agentmon.effectivenessReport?.procedures?.find((result) => result.procedureId === procedureId)?.status || "insufficient";
}

export function eligibleProcedures(agentmon, options = {}) {
  const allowedPermissions = new Set(options.allowedPermissions || []);
  return boundaryEligibleProcedures(agentmon, { allowTesting: options.allowTesting === true })
    .filter((procedure) => options.advisoryMode === true || (procedure.permissions || []).every((permission) => allowedPermissions.has(permission)));
}

export function routeAgentmons(query, agentmons, options = {}) {
  const maxAgentmons = Math.max(1, Math.min(8, Number(options.maxAgentmons) || 1));
  const maxProcedures = Math.max(1, Math.min(8, Number(options.maxProcedures) || 4));
  const evaluations = [];
  const candidates = agentmons.flatMap((agentmon) => {
    const procedures = eligibleProcedures(agentmon, options).map((procedure) => {
      const match = evaluateProcedureMatch(query, procedure);
      evaluations.push(match);
      const evidence = Math.min(20, Math.round((Number(procedure.confidence) || 0) / 5));
      const outcome = effectivenessStatus(agentmon, procedure.id) === "beneficial" ? 15 : 0;
      const missingPermissions = (procedure.permissions || []).filter((permission) => !(options.allowedPermissions || []).includes(permission));
      return { procedure, match, score: Math.min(100, match.relevance + evidence + outcome), outcomeStatus: effectivenessStatus(agentmon, procedure.id), missingPermissions };
    }).filter((item) => item.match.eligible && item.score >= (options.minimumScore ?? 15))
      .sort((left, right) => right.score - left.score || left.procedure.id.localeCompare(right.procedure.id))
      .slice(0, maxProcedures);
    if (!procedures.length && options.includeIdentityFallback !== true) return [];
    return [{
      agentmonId: agentmon.id,
      slot: agentmon.slot || options.defaultSlot || "main",
      name: agentmon.form || agentmon.species,
      score: procedures.length ? Math.round(procedures.reduce((sum, item) => sum + item.score, 0) / procedures.length) : 0,
      identity: compileAgentmonIdentity(agentmon),
      procedures: procedures.map((item) => ({
        id: item.procedure.id,
        name: item.procedure.name,
        score: item.score,
        relevance: item.match.relevance,
        routing: { policy: item.match.policy, reason: item.match.reason, matchedConcepts: item.match.matchedConcepts },
        outcomeStatus: item.outcomeStatus,
        trigger: item.procedure.trigger,
        steps: item.procedure.steps,
        completionCriteria: item.procedure.completionCriteria,
        failureRules: item.procedure.failureRules,
        permissions: item.procedure.permissions,
        missingPermissions: item.missingPermissions,
        executionMode: item.missingPermissions.length ? "advisory-only" : "host-permitted",
      })),
    }];
  }).sort((left, right) => right.score - left.score || left.agentmonId.localeCompare(right.agentmonId)).slice(0, maxAgentmons);
  return {
    format: "agentmon.context-route/v1",
    queryDigest: digest(query),
    mode: options.allowTesting ? "trainer-preview" : "proven-only",
    candidates,
    selected: candidates[0] || null,
    routing: routingAudit(evaluations, candidates[0]?.procedures.length || 0),
    privacy: { rawQueryStored: false, rawQueryIncluded: false },
  };
}

export function createRoutedDownlink(route) {
  if (!route?.selected) return null;
  const selected = route.selected;
  const lines = ["[AGENTMON DOWNLINK v3]", `Active: ${safeIdentityText(selected.name, 100)}`, ...renderIdentityLines(selected.identity), "PROVEN PROCEDURES:"];
  if (!selected.procedures.length) lines.push("- No proven procedure matched. Apply the identity lens only and otherwise answer normally.");
  for (const procedure of selected.procedures) {
    lines.push(`- ${safeIdentityText(procedure.name, 100)}: trigger=${safeIdentityText(procedure.trigger)}`);
    procedure.steps.slice(0, 6).forEach((step, index) => lines.push(`  ${index + 1}. ${safeIdentityText(step)}`));
    if (procedure.completionCriteria?.length) lines.push(`  Done when: ${procedure.completionCriteria.slice(0, 4).map((item) => safeIdentityText(item)).join("; ")}`);
    if (procedure.failureRules?.length) lines.push(`  Stop/avoid: ${procedure.failureRules.slice(0, 4).map((item) => safeIdentityText(item)).join("; ")}`);
    const declared = (procedure.permissions || []).map((item) => safeIdentityText(item, 80));
    const missing = (procedure.missingPermissions || []).map((item) => safeIdentityText(item, 80));
    lines.push(`  Permission boundary: declared=${declared.length ? declared.join(", ") : "none"}; unavailable=${missing.length ? missing.join(", ") : "none"}; mode=${procedure.executionMode}`);
  }
  lines.push("Never claim private memories, hidden reasoning, or permissions that the host did not supply.", "[/AGENTMON DOWNLINK]");
  return { ...route, format: "agentmon.context-route/v2", packet: lines.join("\n").slice(0, 8_000) };
}
