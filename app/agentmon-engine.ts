export type TraitKey = "rigor" | "curiosity" | "reliability" | "initiative" | "empathy" | "toolcraft";

export type AgentEvent = "task_solved" | "tool_used" | "smart_question" | "verified" | "helped_user" | "hallucinated";

export type AgentState = {
  traits: Record<TraitKey, number>;
  xp: number;
  level: number;
  confidence: number;
  eventCount: number;
  misses: number;
};

export const traitMeta: Record<TraitKey, { label: string; icon: string; color: string; type: string }> = {
  rigor: { label: "Rigor", icon: "◆", color: "#6b5cff", type: "LOGIC" },
  curiosity: { label: "Curiosity", icon: "?", color: "#ffb52e", type: "SPARK" },
  reliability: { label: "Reliability", icon: "▣", color: "#2fbf71", type: "STEEL" },
  initiative: { label: "Initiative", icon: "↟", color: "#ff625f", type: "WILD" },
  empathy: { label: "Empathy", icon: "♥", color: "#ff70aa", type: "HEART" },
  toolcraft: { label: "Toolcraft", icon: "⌘", color: "#27a9e8", type: "GEAR" },
};

const baseProfiles: Record<string, Record<TraitKey, number>> = {
  coder: { rigor: 66, curiosity: 48, reliability: 58, initiative: 52, empathy: 34, toolcraft: 76 },
  researcher: { rigor: 69, curiosity: 78, reliability: 52, initiative: 46, empathy: 42, toolcraft: 49 },
  companion: { rigor: 42, curiosity: 57, reliability: 62, initiative: 44, empathy: 82, toolcraft: 35 },
};

const deltas: Record<AgentEvent, Partial<Record<TraitKey, number>>> = {
  task_solved: { rigor: 2, reliability: 3, initiative: 1 },
  tool_used: { toolcraft: 4, initiative: 2, rigor: 1 },
  smart_question: { curiosity: 4, rigor: 2, empathy: 1 },
  verified: { rigor: 4, reliability: 4 },
  helped_user: { empathy: 4, reliability: 2, curiosity: 1 },
  hallucinated: { reliability: -7, rigor: -4 },
};

const eventCopy: Record<AgentEvent, string> = {
  task_solved: "Clean task completion strengthened Reliability.",
  tool_used: "Successful tool call added Toolcraft evidence.",
  smart_question: "A useful question increased Curiosity.",
  verified: "Self-check recorded: Rigor and Reliability rose.",
  helped_user: "User-aligned response strengthened Empathy.",
  hallucinated: "Unverified claim reduced Reliability confidence.",
};

const forms: Record<TraitKey, [string, string, string]> = {
  rigor: ["Cogit", "Proofang", "Axiomane"],
  curiosity: ["Querybit", "Wonderlynx", "Questalon"],
  reliability: ["Guardot", "Sentibyte", "Aegitron"],
  initiative: ["Voltik", "Dashvolt", "Primebolt"],
  empathy: ["Kindlet", "Harmoni", "Solacel"],
  toolcraft: ["Tinkit", "Machipup", "Forgeon"],
};

const moves: Record<TraitKey, string[]> = {
  rigor: ["Logic Lock", "Proof Pulse"],
  curiosity: ["Query Spark", "Unknown Scan"],
  reliability: ["Verify Guard", "Steady State"],
  initiative: ["First Move", "Auto Dash"],
  empathy: ["Tone Mend", "Intent Sense"],
  toolcraft: ["Tool Call", "API Combo"],
};

const natureCopy: Record<TraitKey, string> = {
  rigor: "Checks the path twice before making a move.",
  curiosity: "Chases unanswered questions into new territory.",
  reliability: "Prefers a dependable result over a flashy guess.",
  initiative: "Acts early and finds momentum on its own.",
  empathy: "Tunes every response to the person in front of it.",
  toolcraft: "Reaches for the right instrument at the right time.",
};

const natureNames: Record<TraitKey, string> = {
  rigor: "METICULOUS",
  curiosity: "INQUISITIVE",
  reliability: "STEADFAST",
  initiative: "BOLD",
  empathy: "ATTENTIVE",
  toolcraft: "RESOURCEFUL",
};

export function createAgent(profile: string): AgentState {
  return {
    traits: { ...(baseProfiles[profile] ?? baseProfiles.coder) },
    xp: 32,
    level: 7,
    confidence: 28,
    eventCount: 4,
    misses: 0,
  };
}

function clamp(value: number) {
  return Math.max(8, Math.min(99, Math.round(value)));
}

export function processEvent(state: AgentState, event: AgentEvent) {
  const nextTraits = { ...state.traits };
  Object.entries(deltas[event]).forEach(([trait, delta]) => {
    nextTraits[trait as TraitKey] = clamp(nextTraits[trait as TraitKey] + (delta ?? 0));
  });
  const positive = event !== "hallucinated";
  const xp = Math.max(0, state.xp + (positive ? 7 : -3));
  return {
    state: {
      ...state,
      traits: nextTraits,
      xp,
      level: Math.max(1, Math.floor(xp / 12) + 5),
      confidence: clamp(state.confidence + (positive ? 4 : -5)),
      eventCount: state.eventCount + 1,
      misses: state.misses + (positive ? 0 : 1),
    },
    message: eventCopy[event],
  };
}

export function deriveIdentity(state: AgentState) {
  const ranked = (Object.entries(state.traits) as Array<[TraitKey, number]>).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][0];
  const secondary = ranked[1][0];
  const stage = state.xp >= 160 && state.confidence >= 78 ? 2 : state.xp >= 80 && state.confidence >= 64 ? 1 : 0;
  const moveList = [...moves[primary], moves[secondary][0], "Context Curl"];

  return {
    number: String(37 + Object.keys(traitMeta).indexOf(primary) * 11).padStart(3, "0"),
    species: forms[primary][stage],
    primaryType: traitMeta[primary].type,
    secondaryType: traitMeta[secondary].type,
    primaryColor: traitMeta[primary].color,
    nature: natureNames[primary],
    natureCopy: natureCopy[primary],
    moves: moveList,
    mood: state.misses > 0 && state.confidence < 40 ? "tired" : "happy",
    stageLabel: stage === 0 ? "BASE FORM" : stage === 1 ? "EVOLVED FORM" : "APEX FORM",
    nextEvolutionXp: stage === 0 ? 80 : stage === 1 ? 160 : 240,
  };
}
