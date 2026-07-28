export const EGG_BIND_SCORE = 60;
export const HATCH_SCORE = 100;

function clampScore(value) {
  return Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0));
}

export function visualLifecycle(agentmon) {
  if (!agentmon) return { stage: "signal", score: 0, brightness: 8, label: "UNBOUND SIGNAL", speciesBound: false, hatched: false };
  const legacyWithoutReadiness = !agentmon.hatchReadiness;
  const score = legacyWithoutReadiness ? 100 : clampScore(agentmon.hatchReadiness?.score);
  if (score < EGG_BIND_SCORE) return { stage: "signal", score, brightness: Math.max(8, score), label: "UNBOUND SIGNAL", speciesBound: false, hatched: false };
  if (score < HATCH_SCORE) return { stage: "egg", score, brightness: 100, label: "BOUND EGG", speciesBound: true, hatched: false };
  return { stage: "hatched", score, brightness: 100, label: agentmon.form ?? agentmon.species ?? "AGENTMON", speciesBound: true, hatched: true };
}

export function visualBindingAgentmon(agentmon) {
  const profile = agentmon.growthPromptprint ?? agentmon.promptprint;
  return { ...agentmon, visualBindingProfile: profile };
}
