export type TraitKey = "reasoning" | "curiosity" | "reliability" | "initiative" | "empathy" | "toolcraft";
export type RoleKey = "builder" | "researcher" | "operator" | "companion";
export type ProviderKey = "openai" | "anthropic" | "google" | "local" | "custom";
export type SkillKey = "reasoning" | "web" | "code" | "memory" | "tools" | "vision";

export type AgentInput = {
  name: string;
  provider: ProviderKey;
  model: string;
  role: RoleKey;
  mission: string;
  skills: SkillKey[];
};

export type Move = {
  id: SkillKey;
  name: string;
  type: string;
  power: number;
  description: string;
  icon: string;
};

export type Agentmon = {
  id: string;
  dna: string;
  trainerName: string;
  species: string;
  number: string;
  primaryType: string;
  secondaryType: string;
  primaryColor: string;
  accentColor: string;
  nature: string;
  natureCopy: string;
  traitKey: TraitKey;
  traits: Record<TraitKey, number>;
  moves: Move[];
  variant: number;
  coreGlyph: string;
  provider: ProviderKey;
  model: string;
  mission: string;
};

export const traitMeta: Record<TraitKey, { label: string; icon: string; color: string; type: string }> = {
  reasoning: { label: "Reasoning", icon: "◆", color: "#6b5cff", type: "LOGIC" },
  curiosity: { label: "Curiosity", icon: "?", color: "#ffb52e", type: "SPARK" },
  reliability: { label: "Reliability", icon: "▣", color: "#2fbf71", type: "GUARD" },
  initiative: { label: "Initiative", icon: "↟", color: "#ff625f", type: "BOLT" },
  empathy: { label: "Empathy", icon: "♥", color: "#ff70aa", type: "HEART" },
  toolcraft: { label: "Toolcraft", icon: "⌘", color: "#27a9e8", type: "GEAR" },
};

export const skillLibrary: Record<SkillKey, Move> = {
  reasoning: { id: "reasoning", name: "Logic Lock", type: "LOGIC", power: 66, description: "Builds a precise chain before striking.", icon: "◆" },
  web: { id: "web", name: "Web Scout", type: "SPARK", power: 54, description: "Finds a live fact and exposes a weak point.", icon: "⌕" },
  code: { id: "code", name: "Code Burst", type: "GEAR", power: 72, description: "Compiles a focused technical attack.", icon: "</>" },
  memory: { id: "memory", name: "Recall Ward", type: "GUARD", power: 48, description: "Uses stored context to block the next hit.", icon: "▤" },
  tools: { id: "tools", name: "Tool Combo", type: "GEAR", power: 68, description: "Chains connected tools into one action.", icon: "⌘" },
  vision: { id: "vision", name: "Pixel Sight", type: "SPARK", power: 58, description: "Reads the field and reveals hidden details.", icon: "◉" },
};

export const roleDefaults: Record<RoleKey, { label: string; caption: string; traits: Record<TraitKey, number>; skills: SkillKey[] }> = {
  builder: {
    label: "Builder", caption: "ships code + uses tools",
    traits: { reasoning: 72, curiosity: 48, reliability: 61, initiative: 64, empathy: 34, toolcraft: 84 },
    skills: ["reasoning", "code", "tools"],
  },
  researcher: {
    label: "Researcher", caption: "searches + verifies",
    traits: { reasoning: 76, curiosity: 86, reliability: 68, initiative: 42, empathy: 39, toolcraft: 55 },
    skills: ["reasoning", "web", "memory"],
  },
  operator: {
    label: "Operator", caption: "acts + orchestrates",
    traits: { reasoning: 61, curiosity: 45, reliability: 74, initiative: 86, empathy: 32, toolcraft: 79 },
    skills: ["tools", "memory", "reasoning"],
  },
  companion: {
    label: "Companion", caption: "remembers + supports",
    traits: { reasoning: 49, curiosity: 58, reliability: 69, initiative: 40, empathy: 89, toolcraft: 35 },
    skills: ["memory", "reasoning", "vision"],
  },
};

const speciesNames: Record<TraitKey, string[]> = {
  reasoning: ["Cogit", "Prooflet", "Axiomii"],
  curiosity: ["Querybit", "Wonderkit", "Scoutle"],
  reliability: ["Guardot", "Sentibit", "Wardling"],
  initiative: ["Voltik", "Dashbit", "Sparkrun"],
  empathy: ["Kindlet", "Harmoni", "Solacebit"],
  toolcraft: ["Tinkit", "Machipup", "Forgelet"],
};

const natureNames: Record<TraitKey, string> = {
  reasoning: "METHODICAL",
  curiosity: "INQUISITIVE",
  reliability: "STEADFAST",
  initiative: "BOLD",
  empathy: "ATTENTIVE",
  toolcraft: "RESOURCEFUL",
};

const natureCopy: Record<TraitKey, string> = {
  reasoning: "Maps the whole problem before making a move.",
  curiosity: "Always investigates the strange path first.",
  reliability: "Protects the team with consistent answers.",
  initiative: "Leaps into action before the field settles.",
  empathy: "Reads its trainer and adapts with care.",
  toolcraft: "Collects useful tools and combines them creatively.",
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number) {
  return Math.max(18, Math.min(96, Math.round(value)));
}

function applyMissionSignals(traits: Record<TraitKey, number>, mission: string) {
  const copy = mission.toLowerCase();
  const next = { ...traits };
  if (/code|build|debug|develop|ship/.test(copy)) { next.toolcraft += 7; next.reasoning += 4; }
  if (/research|search|discover|learn|find/.test(copy)) { next.curiosity += 8; next.reasoning += 3; }
  if (/customer|support|coach|teach|help/.test(copy)) { next.empathy += 9; next.reliability += 3; }
  if (/automate|operate|schedule|workflow|run/.test(copy)) { next.initiative += 8; next.toolcraft += 4; }
  if (/safe|verify|accurate|review|audit/.test(copy)) { next.reliability += 8; next.reasoning += 4; }
  (Object.keys(next) as TraitKey[]).forEach((key) => { next[key] = clamp(next[key]); });
  return next;
}

export function createAgentInput(role: RoleKey = "builder"): AgentInput {
  return {
    name: "Nova",
    provider: "openai",
    model: "My coding agent",
    role,
    mission: "Build, debug, and ship reliable software with connected tools.",
    skills: [...roleDefaults[role].skills],
  };
}

export function generateAgentmon(input: AgentInput): Agentmon {
  const seedSource = `${input.provider}|${input.model}|${input.role}|${input.mission.trim().toLowerCase()}`;
  const seed = hashText(seedSource);
  const traits = applyMissionSignals(roleDefaults[input.role].traits, input.mission);
  input.skills.forEach((skill) => {
    if (skill === "code" || skill === "tools") traits.toolcraft = clamp(traits.toolcraft + 3);
    if (skill === "web" || skill === "vision") traits.curiosity = clamp(traits.curiosity + 3);
    if (skill === "memory") traits.reliability = clamp(traits.reliability + 3);
    if (skill === "reasoning") traits.reasoning = clamp(traits.reasoning + 3);
  });
  const ranked = (Object.entries(traits) as Array<[TraitKey, number]>).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][0];
  const secondary = ranked[1][0];
  const variant = seed % 3;
  const dna = seed.toString(16).toUpperCase().padStart(8, "0");
  const moveIds = [...input.skills, "reasoning"].filter((skill, index, list) => list.indexOf(skill) === index).slice(0, 4);

  return {
    id: `AGM-${dna.slice(0, 4)}-${dna.slice(4)}`,
    dna,
    trainerName: input.name.trim() || "Untitled agent",
    species: speciesNames[primary][variant],
    number: String(101 + (seed % 798)).padStart(3, "0"),
    primaryType: traitMeta[primary].type,
    secondaryType: traitMeta[secondary].type,
    primaryColor: traitMeta[primary].color,
    accentColor: traitMeta[secondary].color,
    nature: natureNames[primary],
    natureCopy: natureCopy[primary],
    traitKey: primary,
    traits,
    moves: moveIds.map((skill) => skillLibrary[skill]),
    variant,
    coreGlyph: ["✦", "◆", "⌘"][seed % 3],
    provider: input.provider,
    model: input.model,
    mission: input.mission,
  };
}

export function equipSkills(agentmon: Agentmon, skills: SkillKey[]) {
  const unique = [...skills, "reasoning"].filter((skill, index, list) => list.indexOf(skill) === index).slice(0, 4);
  return { ...agentmon, moves: unique.map((skill) => skillLibrary[skill]) };
}

export function tradeCode(agentmon: Agentmon) {
  return `${agentmon.id}-${agentmon.dna.slice(1, 3)}`;
}
