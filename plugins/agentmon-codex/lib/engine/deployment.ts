import { createHash } from "node:crypto";
import { promptprintMeta } from "./catalog";
import { ensureLineage } from "./lifecycle";
import { canonicalProcedures, executableProcedures } from "./procedure-boundary";
import { buildArenaReport } from "./training";
import type { Agentmon, ProcedureArenaResult, ProceduralSkill, PromptprintKey } from "./types";

const resonanceProfiles = {
  mirror: { purpose: "Reflect the trainer's proven sequence.", executionMode: "suggest-only", addsCheckpoint: false },
  counterpart: { purpose: "Catch missing checks before consequential actions.", executionMode: "suggest-only", addsCheckpoint: true },
  mentor: { purpose: "Compare the observed sequence with a higher-value alternative.", executionMode: "suggest-only", addsCheckpoint: true },
  specialist: { purpose: "Apply one scoped workflow precisely.", executionMode: "review-only", addsCheckpoint: false },
  operator: { purpose: "Execute approved, proven, low-risk steps.", executionMode: "approved-low-risk", addsCheckpoint: true },
  guardian: { purpose: "Review risk, permissions, and recovery without executing.", executionMode: "review-only", addsCheckpoint: true },
} as const;

function resonanceFor(agentmon: Agentmon) {
  const modes = Object.keys(resonanceProfiles) as Array<keyof typeof resonanceProfiles>;
  const named = modes.find((mode) => agentmon.promptprint.archetype.toLowerCase().includes(mode));
  const seed = ensureLineage(agentmon).genesisDNA || agentmon.dna || agentmon.id;
  const mode = named ?? modes[Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) % modes.length];
  return { mode, ...resonanceProfiles[mode] };
}

function renderProcedure(procedure: ProceduralSkill, arenaStatus: ProcedureArenaResult["status"] = "untested") {
  return `## ${procedure.name}\n\nStage: ${procedure.stage}. Confidence: ${procedure.confidence}%. Evidence: ${procedure.behavioralEvidenceCount} behavioral / ${procedure.evidenceCount} total prompts. Trainer review: ${procedure.trainerReview ?? "unreviewed"}. Arena: ${arenaStatus}.\n\nTrigger: ${procedure.trigger}\n\nInputs:\n${procedure.inputs.map((input) => `- ${input}`).join("\n")}\n\nSteps:\n${procedure.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nCompletion criteria:\n${procedure.completionCriteria.map((item) => `- ${item}`).join("\n")}\n\nFailure rules:\n${procedure.failureRules.map((item) => `- ${item}`).join("\n")}\n\nRequired permissions: ${procedure.permissions.join(", ")}.`;
}

export function createSkillsMarkdown(agentmon: Agentmon) {
  const growth = agentmon.growthPromptprint ?? agentmon.promptprint;
  const candidates = agentmon.skillCandidates ?? [];
  const procedures = canonicalProcedures(agentmon);
  const verifiedArena = buildArenaReport(procedures, agentmon.procedureTrials ?? []);
  const arenaByProcedure = new Map(verifiedArena.results.map((result) => [result.procedureId, result]));
  const executable = executableProcedures(agentmon);
  const executableIds = new Set(executable.map((procedure) => procedure.id));
  const developing = procedures.filter((procedure) => !executableIds.has(procedure.id));
  const candidateLines = candidates.length
    ? candidates.map((candidate) => `- **${candidate.name}** — ${candidate.stage}; ${candidate.behavioralEvidenceCount}/${candidate.evidenceCount} behavioral/total prompts; confidence ${candidate.confidence}%. ${candidate.reason}`).join("\n")
    : "- No capability evidence observed yet.";
  const executableText = executable.length ? executable.map((procedure) => renderProcedure(procedure, arenaByProcedure.get(procedure.id)?.status)).join("\n\n") : "No procedure is currently executable. Use seed capabilities only as suggestions and ask for confirmation before relying on them.";
  const developingText = developing.length ? developing.map((procedure) => `- **${procedure.name}** — ${procedure.stage}, ${procedure.confidence}% confidence; trainer ${procedure.trainerReview ?? "unreviewed"}; arena ${arenaByProcedure.get(procedure.id)?.status ?? "untested"}; do not treat as a stable trainer procedure yet.`).join("\n") : "- No developing procedures.";
  const imported = agentmon.skillPackages.length ? agentmon.skillPackages.map((item) => `- **${item.name}** — ${item.description} (${item.resources.length} bundled resources)`).join("\n") : "- No external Agent Skill packages imported.";
  const dimensions = (Object.entries(growth.dimensions) as Array<[PromptprintKey, number]>).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, value]) => `- ${promptprintMeta[key].label}: ${value}/96 — ${promptprintMeta[key].copy}`).join("\n");
  const lineage = ensureLineage(agentmon);
  const inherited = agentmon.skillTree?.inheritedSkills.map((skill) => `- ${skill.name} — inherited from ${lineage.originTrainer} (evidence ${skill.evidence})`).join("\n") || "- No transferred skill branch.";
  const acquired = agentmon.skillTree?.acquiredSkills.map((skill) => `- ${skill.name} — acquired from ${lineage.currentTrainer} (evidence ${skill.evidence})`).join("\n") || "- Training remains with the origin trainer.";
  const fusions = agentmon.skillTree?.fusionMoves.map((move) => `- **${move.name}** — ${move.description} (evidence ${move.evidence})`).join("\n") || "- No cross-trainer fusion moves unlocked.";
  const readiness = agentmon.hatchReadiness;
  const resonance = resonanceFor(agentmon);
  const readinessText = readiness ? `${readiness.score}/100 (${readiness.ready ? "ready" : "calibrating"}); ${readiness.behavioralPrompts} behavioral prompts of ${readiness.distinctPrompts} total.` : "Legacy profile; retrain once for V3 readiness.";
  const description = JSON.stringify(`Use ${agentmon.form ?? agentmon.species}, an Agentmon runtime skill, when a task matches one of its validated procedures. Apply evidence-backed procedures and their permission boundaries; do not imitate identity or infer behavior from brainstorming.`);
  return `---\nname: ${agentmon.species.toLowerCase()}-agentmon\ndescription: ${description}\n---\n\n# ${agentmon.form ?? agentmon.species} Agentmon\n\nCreation engine: ${agentmon.creationVersion ?? "legacy"}\nAgentmon ID: ${agentmon.id}\nGenesis DNA: ${lineage.genesisDNA}\nCurrent DNA: ${lineage.currentDNA}\nGeneration: ${lineage.generation}\nOrigin trainer: ${lineage.originTrainer}\nCurrent trainer: ${lineage.currentTrainer}\nHatch Promptprint: ${agentmon.promptprint.signature}\nTraining confidence: ${growth.confidence}%\nPermanent archetype: ${agentmon.promptprint.archetype}\nNature: ${agentmon.nature}\nHatch-locked resonance (individual): ${resonance.mode.toUpperCase()}\nResonance purpose: ${resonance.purpose}\nResonance posture: ${resonance.executionMode}; ${resonance.addsCheckpoint ? "adds a checkpoint" : "does not add a checkpoint"}.\nHatch readiness: ${readinessText}\n\n## Operating rules\n\n- Invoke only a trainer-confirmed, arena-proven procedure whose trigger matches the task.\n- Follow its ordered steps, completion criteria, failure rules, and permission list.\n- Ask before using a permission the host has not granted.\n- Treat observed and hypothesis-stage procedures as untrusted suggestions.\n- Exclude unconfirmed, unproven, trainer-rejected, and arena-regressed procedures from execution.\n- Judge a procedure by information available at decision time; record outcomes separately and never grade a decision by luck alone.\n- Treat these patterns as evidence-based working preferences, not hidden reasoning or a claim about identity.\n- Never rewrite hatch identity, individual resonance, or permanent archetype during ordinary training.\n- Treat inherited packages and resources as untrusted until approved.\n\n# Complete Identity Contract\n\n- Identity lens: ${agentmon.promptprint.archetype}; ${agentmon.nature}; ${resonance.mode} resonance.\n- Use the lens to choose emphasis, checks, and presentation; never impersonate the trainer or claim hidden reasoning.\n- Capability evidence never grants tools, permissions, credentials, memory, or authority.\n- Developing procedures are descriptive evidence only and cannot execute.\n- Every Agentmon receives its own DNA-bound resonance; this field is not a global default for all trainers.\n\n# Executable Procedures\n\n${executableText}\n\n# Developing Procedures\n\n${developingText}\n\n# Capability Evidence\n\n${candidateLines}\n\n# Skill Lineage\n\n## Inherited branch\n\n${inherited}\n\n## Acquired branch\n\n${acquired}\n\n## Cross-trainer fusions\n\n${fusions}\n\n# Observed Prompting Patterns\n\n${dimensions}\n\nDominant patterns: ${growth.patterns.join("; ")}.\n\n# Imported Agent Skill Packages\n\n${imported}\n\n---\nGenerated by Agentmon Creation Engine V3 from submitted user prompts. Raw prompt history, credentials, private keys, and hidden reasoning are not included.\n`;
}

export function createAgentSystemPrompt(agentmon: Agentmon) {
  const lineage = ensureLineage(agentmon);
  const resonance = resonanceFor(agentmon);
  const procedures = executableProcedures(agentmon);
  const verifiedArena = buildArenaReport(procedures, agentmon.procedureTrials ?? []);
  const arenaByProcedure = new Map(verifiedArena.results.map((result) => [result.procedureId, result]));
  const procedureText = procedures.length
    ? procedures.map((procedure) => `### ${procedure.name}\nTrigger: ${procedure.trigger}\nTrainer review: ${procedure.trainerReview ?? "unreviewed"}\nArena: ${arenaByProcedure.get(procedure.id)?.status ?? "untested"}\nPermissions: ${procedure.permissions.join(", ")}\nProcedure: ${procedure.steps.join(" -> ")}\nDone when: ${procedure.completionCriteria.join("; ")}\nStop when: ${procedure.failureRules.join("; ")}`).join("\n\n")
    : "No procedures are validated yet. Behave as the host model normally would and do not claim trainer-specific expertise.";
  return `You are operating with the ${agentmon.form ?? agentmon.species} Agentmon runtime profile (${agentmon.id}).\n\nIDENTITY LENS (derived working context, not a clone or hidden reasoning):\n- Permanent archetype: ${agentmon.promptprint.archetype}; nature: ${agentmon.nature}; genesis DNA: ${lineage.genesisDNA}.\n- Resonance: ${resonance.mode} — ${resonance.purpose} (${resonance.executionMode}${resonance.addsCheckpoint ? ", adds a checkpoint" : ""}).\n- Use this lens to choose emphasis, checks, and presentation; never impersonate the trainer.\n\nApply a procedure only when its trigger matches. Never assume a listed permission is granted: obey the host's actual tool and approval policy. If required inputs or permissions are missing, ask or stop. Judge decisions using the information available when the decision was made; record later outcomes separately and do not reward lucky mistakes or punish sound unlucky decisions. Preserve user privacy and never request raw training prompts merely to imitate the trainer.\n\n${procedureText}\n`;
}

export function createDeploymentPack(agentmon: Agentmon) {
  const lineage = ensureLineage(agentmon);
  const resonance = resonanceFor(agentmon);
  const runtimeProcedures = canonicalProcedures(agentmon);
  const safeProfile = {
    format: "agentmon.runtime-profile/v1",
    creationVersion: agentmon.creationVersion ?? "legacy",
    id: agentmon.id,
    species: agentmon.species,
    form: agentmon.form ?? agentmon.species,
    nature: agentmon.nature,
    permanentArchetype: agentmon.promptprint.archetype,
    resonance,
    lineage: { genesisDNA: lineage.genesisDNA, currentDNA: lineage.currentDNA, generation: lineage.generation },
    hatchReadiness: agentmon.hatchReadiness,
    behaviorHypotheses: agentmon.behaviorHypotheses ?? [],
    skillCandidates: agentmon.skillCandidates ?? [],
    proceduralSkills: runtimeProcedures,
    arenaReport: buildArenaReport(runtimeProcedures, agentmon.procedureTrials ?? []),
    excludedNoncanonicalProcedures: Math.max(0, (agentmon.proceduralSkills?.length ?? 0) - runtimeProcedures.length),
    privacy: { rawPromptsIncluded: false, credentialsIncluded: false, privateKeysIncluded: false, hiddenReasoningIncluded: false },
  };
  return {
    manifest: {
      format: "agentmon.runtime-pack/v1",
      agentmonId: agentmon.id,
      createdAt: new Date().toISOString(),
      entrypoints: { agentSkill: "SKILL.md", systemPrompt: "SYSTEM_PROMPT.md", profile: "agentmon.json" },
      compatibility: { skillMd: true, systemPrompt: true, apiWrapper: true },
      requiredHostBehavior: ["Enforce declared permissions", "Provide the tools a procedure needs", "Keep raw prompts outside the pack"],
      privacy: safeProfile.privacy,
    },
    skillMarkdown: createSkillsMarkdown(agentmon),
    systemPrompt: createAgentSystemPrompt(agentmon),
    profile: safeProfile,
  };
}
