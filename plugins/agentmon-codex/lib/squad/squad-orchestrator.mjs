import { createHash, randomUUID } from "node:crypto";
import { routeAgentmons } from "../routing/context-router.mjs";

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function planSquadQuest(objective, agentmons, options = {}) {
  const roles = options.roles || ["architect", "builder", "researcher", "critic"];
  const assignments = roles.flatMap((role) => {
    const route = routeAgentmons(`${role} ${objective}`, agentmons, { ...options, maxAgentmons: 1, maxProcedures: 2 });
    if (!route.selected) return [];
    return [{ id: randomUUID(), role, agentmonId: route.selected.agentmonId, slot: route.selected.slot, procedureIds: route.selected.procedures.map((procedure) => procedure.id), permissions: [...new Set(route.selected.procedures.flatMap((procedure) => procedure.permissions || []))], status: "proposed" }];
  });
  return {
    format: "agentmon.squad-plan/v1",
    id: `squad-plan-${randomUUID()}`,
    objectiveDigest: digest(objective),
    assignments,
    integration: { owner: assignments.find((assignment) => assignment.role === "architect")?.agentmonId || assignments[0]?.agentmonId || null, requiresReview: true, executeAutomatically: false },
    permissions: { inherited: false, requiresPerAssignmentApproval: true },
    privacy: { rawObjectiveStored: false },
  };
}

export async function executeSquadPlan(plan, options = {}) {
  if (plan?.format !== "agentmon.squad-plan/v1") throw new Error("Expected agentmon.squad-plan/v1.");
  const objective = String(options.objective || "");
  if (!objective || digest(objective) !== plan.objectiveDigest) throw new Error("Squad objective does not match the approved plan digest.");
  if (typeof options.runner !== "function") throw new Error("Squad execution requires an explicit runner adapter.");
  const approvals = new Set(options.approvedAssignmentIds || []);
  const unapproved = plan.assignments.find((assignment) => !approvals.has(assignment.id));
  if (unapproved) throw new Error(`Assignment ${unapproved.id} requires explicit approval.`);
  const startedAt = new Date().toISOString();
  const privateResults = await Promise.all(plan.assignments.map(async (assignment) => {
    const result = await options.runner({ objective, assignment: { ...assignment }, permissions: assignment.permissions || [] });
    if (!result || typeof result !== "object") throw new Error(`Runner returned no result for ${assignment.id}.`);
    return { assignmentId: assignment.id, role: assignment.role, agentmonId: assignment.agentmonId, status: result.status === "failed" ? "failed" : "completed", artifact: result.artifact ?? null, metrics: result.metrics ?? null };
  }));
  const review = typeof options.reviewer === "function"
    ? await options.reviewer({ objective, results: privateResults })
    : { accepted: false, status: "review-required" };
  const completedAt = new Date().toISOString();
  const publicRecord = {
    format: "agentmon.squad-run/v1",
    planId: plan.id,
    objectiveDigest: plan.objectiveDigest,
    startedAt,
    completedAt,
    assignments: privateResults.map((result) => ({ assignmentId: result.assignmentId, role: result.role, agentmonId: result.agentmonId, status: result.status, artifactDigest: digest(result.artifact ?? ""), metrics: result.metrics })),
    review: { accepted: review?.accepted === true, status: String(review?.status || (review?.accepted ? "accepted" : "rejected")) },
    privacy: { rawObjectiveIncluded: false, rawArtifactsIncluded: false },
  };
  return { privateResults, review, publicRecord };
}
