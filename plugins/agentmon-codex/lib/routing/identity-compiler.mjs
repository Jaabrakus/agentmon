import { createHash } from "node:crypto";
import { deterministicResonance, resonanceProfile } from "../actions/action-contract.mjs";

const PATTERN_META = {
  structure: { label: "Structure", behavior: "Plan and format before acting" },
  precision: { label: "Precision", behavior: "Define exact constraints and outputs" },
  exploration: { label: "Exploration", behavior: "Open alternatives and new paths" },
  iteration: { label: "Iteration", behavior: "Refine repeatedly through feedback" },
  verification: { label: "Verification", behavior: "Check claims, tests, and evidence" },
  delegation: { label: "Delegation", behavior: "Split work across agents or roles" },
  toolfulness: { label: "Toolfulness", behavior: "Use available tools and integrations" },
  empathy: { label: "Human sense", behavior: "Shape work around the audience" },
};

export function safeIdentityText(value, max = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function identityDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compileWorkingPatterns(agentmon) {
  const profile = agentmon.growthPromptprint || agentmon.promptprint || {};
  const confidence = Number(profile.confidence) || 0;
  const sampleCount = Number(profile.sampleCount) || 0;
  if (confidence < 70 || sampleCount < 5) return { confidence, sampleCount, status: "developing", patterns: [] };
  const patterns = Object.entries(profile.dimensions || {})
    .filter(([key, score]) => PATTERN_META[key] && Number(score) >= 32)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([key, score]) => ({ key, label: PATTERN_META[key].label, behavior: PATTERN_META[key].behavior, score: Number(score) }));
  return { confidence, sampleCount, status: "trusted-derived", patterns };
}

function compileCapabilities(agentmon) {
  const learnedById = new Map((agentmon.learnedSkills || []).map((skill) => [skill.id, skill]));
  return (agentmon.skillCandidates || [])
    .filter((candidate) => ["validated", "learned"].includes(candidate.stage)
      && Number(candidate.confidence) >= 70
      && Number(candidate.behavioralEvidenceCount) >= 3)
    .sort((left, right) => Number(right.confidence) - Number(left.confidence) || left.id.localeCompare(right.id))
    .slice(0, 6)
    .map((candidate) => {
      const learned = learnedById.get(candidate.id) || {};
      return {
        id: safeIdentityText(candidate.id, 80),
        name: safeIdentityText(candidate.name || learned.name || candidate.id, 100),
        description: safeIdentityText(learned.description || candidate.reason || "Evidence-backed capability tendency."),
        stage: candidate.stage,
        confidence: Number(candidate.confidence) || 0,
        behavioralEvidenceCount: Number(candidate.behavioralEvidenceCount) || 0,
      };
    });
}

export function compileAgentmonIdentity(agentmon) {
  const hatchProfile = agentmon.promptprint || {};
  const growthProfile = compileWorkingPatterns(agentmon);
  const resonance = resonanceProfile(deterministicResonance(agentmon));
  const lineage = agentmon.lineage || {};
  const identity = {
    format: "agentmon.identity-context/v1",
    name: safeIdentityText(agentmon.form || agentmon.species || "Agentmon", 100),
    species: safeIdentityText(agentmon.species || "unbound", 100),
    nature: safeIdentityText(agentmon.nature || "unknown", 80),
    permanentArchetype: safeIdentityText(hatchProfile.archetype || "unknown", 120),
    hatchConfidence: Number(hatchProfile.confidence) || 0,
    generation: Math.max(1, Number(lineage.generation) || 1),
    resonance: {
      mode: resonance.mode,
      purpose: safeIdentityText(resonance.purpose),
      executionMode: resonance.executionMode,
      addsCheckpoint: resonance.addsCheckpoint,
    },
    workingProfile: growthProfile,
    capabilities: compileCapabilities(agentmon),
    boundaries: {
      cloneClaimAllowed: false,
      hiddenReasoningClaimAllowed: false,
      capabilityMeansToolAccess: false,
      developingProceduresExecutable: false,
    },
  };
  return { ...identity, digest: identityDigest(identity) };
}

export function renderIdentityLines(identity) {
  const lines = [
    "IDENTITY LENS (derived working context, not a clone or hidden reasoning):",
    `- Permanent archetype: ${safeIdentityText(identity.permanentArchetype)} · nature ${safeIdentityText(identity.nature)} · generation ${Number(identity.generation) || 1}`,
    `- Resonance: ${safeIdentityText(identity.resonance.mode)} — ${safeIdentityText(identity.resonance.purpose)} (${safeIdentityText(identity.resonance.executionMode)})`,
  ];
  if (identity.workingProfile.patterns.length) {
    lines.push(`- Trusted working patterns (${identity.workingProfile.confidence}% confidence, ${identity.workingProfile.sampleCount} samples):`);
    for (const pattern of identity.workingProfile.patterns) {
      lines.push(`  - ${safeIdentityText(pattern.label)} ${Number(pattern.score)}/96: ${safeIdentityText(pattern.behavior)}`);
    }
  } else {
    lines.push("- Working patterns are still developing; do not use them as instructions.");
  }
  if (identity.capabilities.length) {
    lines.push("- Evidence-backed capability tendencies (these do not grant tools):");
    for (const capability of identity.capabilities) {
      lines.push(`  - ${safeIdentityText(capability.name)}: ${safeIdentityText(capability.description)} (${capability.stage}, ${capability.confidence}% confidence)`);
    }
  }
  lines.push("Use this lens to choose emphasis, checks, and presentation—not to impersonate the trainer.");
  return lines;
}
