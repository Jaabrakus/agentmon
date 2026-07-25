export type TraitKey = "reasoning" | "curiosity" | "reliability" | "initiative" | "empathy" | "toolcraft";
export type RoleKey = "builder" | "researcher" | "operator" | "companion";
export type ProviderKey = "openai" | "anthropic" | "google" | "local" | "custom";
export type SkillKey = "reasoning" | "web" | "code" | "memory" | "tools" | "vision" | "planning" | "loops" | "delegation" | "critique";

export type AgentInput = {
  name: string;
  provider: ProviderKey;
  model: string;
  role: RoleKey;
  mission: string;
  skills: SkillKey[];
};

export type TrainingSource = {
  id: string;
  name: string;
  kind: "prompt" | "history" | "skills" | "json" | "resource";
  content: string;
  size: number;
};

export type Move = {
  id: SkillKey;
  name: string;
  type: string;
  power: number;
  description: string;
  icon: string;
};

export type LearnedSkill = Move & { evidence: number; source: string };

export type AgentLoop = {
  id: string;
  name: string;
  icon: string;
  trigger: string;
  steps: string[];
  evidence: number;
};

export type AgentSkillPackage = {
  name: string;
  description: string;
  folder: string;
  instructions: string;
  resources: Array<{ path: string; content: string }>;
  sourceFile: string;
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
  learnedSkills: LearnedSkill[];
  skillPackages: AgentSkillPackage[];
  loops: AgentLoop[];
  variant: number;
  coreGlyph: string;
  provider: ProviderKey;
  model: string;
  mission: string;
  sourceCount: number;
  trainingBytes: number;
  trainedAt: string;
};

export type TradePackage = {
  format: "agentmon.trade/v1";
  exportedAt: string;
  creature: Omit<Agentmon, "trainedAt">;
  privacy: { rawPromptsIncluded: false; credentialsIncluded: false };
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
  reasoning: { id: "reasoning", name: "Logic Lock", type: "LOGIC", power: 66, description: "Breaks complex goals into precise steps.", icon: "◆" },
  web: { id: "web", name: "Web Scout", type: "SPARK", power: 54, description: "Searches live sources and brings back evidence.", icon: "⌕" },
  code: { id: "code", name: "Code Burst", type: "GEAR", power: 72, description: "Builds, debugs, and patches software.", icon: "</>" },
  memory: { id: "memory", name: "Recall Ward", type: "GUARD", power: 48, description: "Uses stored context and preferences safely.", icon: "▤" },
  tools: { id: "tools", name: "Tool Combo", type: "GEAR", power: 68, description: "Chains APIs, connectors, and MCP tools.", icon: "⌘" },
  vision: { id: "vision", name: "Pixel Sight", type: "SPARK", power: 58, description: "Reads images, screens, and visual artifacts.", icon: "◉" },
  planning: { id: "planning", name: "Quest Map", type: "LOGIC", power: 56, description: "Creates milestones and tracks the next action.", icon: "⌖" },
  loops: { id: "loops", name: "Loop Drive", type: "BOLT", power: 74, description: "Repeats a workflow until its exit condition is met.", icon: "↻" },
  delegation: { id: "delegation", name: "Swarm Call", type: "HEART", power: 64, description: "Splits work across helpers and recombines results.", icon: "⋈" },
  critique: { id: "critique", name: "Truth Check", type: "GUARD", power: 62, description: "Tests, reviews, and corrects weak outputs.", icon: "✓" },
};

export const roleDefaults: Record<RoleKey, { label: string; caption: string; traits: Record<TraitKey, number>; skills: SkillKey[] }> = {
  builder: { label: "Builder", caption: "ships code + tools", traits: { reasoning: 72, curiosity: 48, reliability: 61, initiative: 64, empathy: 34, toolcraft: 84 }, skills: ["reasoning", "code", "tools"] },
  researcher: { label: "Researcher", caption: "searches + verifies", traits: { reasoning: 76, curiosity: 86, reliability: 68, initiative: 42, empathy: 39, toolcraft: 55 }, skills: ["reasoning", "web", "critique"] },
  operator: { label: "Operator", caption: "acts + orchestrates", traits: { reasoning: 61, curiosity: 45, reliability: 74, initiative: 86, empathy: 32, toolcraft: 79 }, skills: ["tools", "planning", "loops"] },
  companion: { label: "Companion", caption: "remembers + supports", traits: { reasoning: 49, curiosity: 58, reliability: 69, initiative: 40, empathy: 89, toolcraft: 35 }, skills: ["memory", "reasoning", "vision"] },
};

const speciesNames: Record<TraitKey, string[]> = {
  reasoning: ["Cogit", "Prooflet", "Axiomii"], curiosity: ["Querybit", "Wonderkit", "Scoutle"], reliability: ["Guardot", "Sentibit", "Wardling"], initiative: ["Voltik", "Dashbit", "Sparkrun"], empathy: ["Kindlet", "Harmoni", "Solacebit"], toolcraft: ["Tinkit", "Machipup", "Forgelet"],
};

const natureNames: Record<TraitKey, string> = { reasoning: "METHODICAL", curiosity: "INQUISITIVE", reliability: "STEADFAST", initiative: "BOLD", empathy: "ATTENTIVE", toolcraft: "RESOURCEFUL" };
const natureCopy: Record<TraitKey, string> = { reasoning: "Maps the whole problem before making a move.", curiosity: "Investigates every strange path it finds.", reliability: "Protects the team with consistent answers.", initiative: "Leaps into action before the field settles.", empathy: "Reads its trainer and adapts with care.", toolcraft: "Collects useful tools and combines them creatively." };

const skillPatterns: Record<SkillKey, RegExp> = {
  reasoning: /reason|analy[sz]|step[- ]by[- ]step|deduc|compare|tradeoff|think through/gi,
  web: /search|browse|source|citation|research|url|https?:\/\//gi,
  code: /code|debug|function|class |typescript|javascript|python|sql|npm |git |compile|test suite/gi,
  memory: /remember|memory|context|history|preference|recall|knowledge base/gi,
  tools: /tool call|function call|api |mcp|connector|terminal|execute|integration/gi,
  vision: /image|visual|screenshot|camera|diagram|pixel|render/gi,
  planning: /plan|todo|milestone|roadmap|next step|first.+then|step [0-9]/gi,
  loops: /loop|iterate|retry|until|repeat|monitor|poll|reflect|recurring/gi,
  delegation: /delegate|subagent|parallel|handoff|worker|swarm|team of agents/gi,
  critique: /verify|review|validate|double-check|critique|audit|quality check|fact-check/gi,
};

function hashText(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function clamp(value: number) { return Math.max(18, Math.min(96, Math.round(value))); }

function countMatches(text: string, pattern: RegExp) {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

function buildLoops(scores: Record<SkillKey, number>): AgentLoop[] {
  const loops: AgentLoop[] = [];
  if (scores.loops + scores.critique > 1) loops.push({ id: "build-verify", name: "BUILD · VERIFY · RETRY", icon: "↻", trigger: "Output fails its quality gate", steps: ["Plan", "Execute", "Verify", "Retry or ship"], evidence: scores.loops + scores.critique });
  if (scores.web + scores.critique > 1) loops.push({ id: "research-proof", name: "RESEARCH PROOF LOOP", icon: "⌕", trigger: "A claim needs fresh evidence", steps: ["Search", "Open sources", "Cross-check", "Synthesize"], evidence: scores.web + scores.critique });
  if (scores.code + scores.tools > 1) loops.push({ id: "ship-loop", name: "AGENT SHIP LOOP", icon: "⌘", trigger: "A build task is assigned", steps: ["Inspect", "Patch", "Run checks", "Package"], evidence: scores.code + scores.tools });
  if (scores.delegation + scores.planning > 1) loops.push({ id: "swarm-loop", name: "PARALLEL SWARM LOOP", icon: "⋈", trigger: "Work splits into independent tracks", steps: ["Decompose", "Delegate", "Collect", "Reconcile"], evidence: scores.delegation + scores.planning });
  if (scores.memory > 1) loops.push({ id: "recall-loop", name: "CONTEXT RECALL LOOP", icon: "▤", trigger: "A known user or project returns", steps: ["Recall", "Confirm", "Respond", "Update memory"], evidence: scores.memory });
  return loops.sort((a, b) => b.evidence - a.evidence).slice(0, 4);
}

function frontmatterValue(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "mi"));
  return match?.[1]?.trim() ?? "";
}

export function parseSkillPackages(sources: TrainingSource[]): AgentSkillPackage[] {
  return sources.filter((source) => /(^|\/)skill\.md$/i.test(source.name) || source.kind === "skills").map((source) => {
    const match = source.content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    const frontmatter = match?.[1] ?? "";
    const instructions = (match?.[2] ?? source.content).trim();
    const folder = source.name.includes("/") ? source.name.split("/").slice(0, -1).join("/") : source.name.replace(/\.md$/i, "");
    const fallbackName = folder.split("/").filter(Boolean).pop() ?? "imported-skill";
    const resources = sources.filter((item) => item.id !== source.id && folder && item.name.startsWith(`${folder}/`)).map((item) => ({ path: item.name.slice(folder.length + 1), content: item.content }));
    return {
      name: frontmatterValue(frontmatter, "name") || fallbackName.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      description: frontmatterValue(frontmatter, "description") || instructions.split("\n").find((line) => line.trim() && !line.startsWith("#"))?.trim() || "Imported Agent Skill package",
      folder,
      instructions,
      resources,
      sourceFile: source.name,
    };
  });
}

export function analyzeTraining(sources: TrainingSource[], defaults: SkillKey[]) {
  const corpus = sources.map((source) => source.content).join("\n\n");
  const scores = Object.fromEntries((Object.keys(skillLibrary) as SkillKey[]).map((skill) => [skill, countMatches(corpus, skillPatterns[skill])])) as Record<SkillKey, number>;
  defaults.forEach((skill) => { scores[skill] += 1; });
  const learnedSkills = (Object.keys(scores) as SkillKey[])
    .filter((skill) => scores[skill] > 0)
    .sort((a, b) => scores[b] - scores[a])
    .map((skill) => ({ ...skillLibrary[skill], evidence: scores[skill], source: scores[skill] > 1 ? "Observed repeatedly" : "Seed capability" }));
  return { corpus, scores, learnedSkills, loops: buildLoops(scores), skillPackages: parseSkillPackages(sources) };
}

function applySignals(traits: Record<TraitKey, number>, scores: Record<SkillKey, number>) {
  const next = { ...traits };
  next.reasoning += Math.min(15, scores.reasoning * 2 + scores.planning);
  next.curiosity += Math.min(15, scores.web * 2 + scores.vision);
  next.reliability += Math.min(15, scores.critique * 2 + scores.memory);
  next.initiative += Math.min(15, scores.loops * 2 + scores.delegation);
  next.empathy += Math.min(12, scores.memory + scores.delegation);
  next.toolcraft += Math.min(15, scores.tools * 2 + scores.code);
  (Object.keys(next) as TraitKey[]).forEach((key) => { next[key] = clamp(next[key]); });
  return next;
}

export function createAgentInput(role: RoleKey = "builder"): AgentInput {
  return { name: "Nova", provider: "openai", model: "My coding agent", role, mission: "Build, debug, and ship reliable software with connected tools.", skills: [...roleDefaults[role].skills] };
}

export function generateAgentmon(input: AgentInput, sources: TrainingSource[] = []): Agentmon {
  const seedSource = `${input.provider}|${input.model}|${input.role}|${input.mission.trim().toLowerCase()}`;
  const seed = hashText(seedSource);
  const analysis = analyzeTraining(sources, input.skills);
  const traits = applySignals(roleDefaults[input.role].traits, analysis.scores);
  const ranked = (Object.entries(traits) as Array<[TraitKey, number]>).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][0]; const secondary = ranked[1][0]; const variant = seed % 3;
  const dna = seed.toString(16).toUpperCase().padStart(8, "0");
  const learnedSkills = analysis.learnedSkills.length ? analysis.learnedSkills : input.skills.map((skill) => ({ ...skillLibrary[skill], evidence: 1, source: "Seed capability" }));
  return {
    id: `AGM-${dna.slice(0, 4)}-${dna.slice(4)}`, dna, trainerName: input.name.trim() || "Untitled agent", species: speciesNames[primary][variant], number: String(101 + (seed % 798)).padStart(3, "0"), primaryType: traitMeta[primary].type, secondaryType: traitMeta[secondary].type, primaryColor: traitMeta[primary].color, accentColor: traitMeta[secondary].color, nature: natureNames[primary], natureCopy: natureCopy[primary], traitKey: primary, traits, moves: learnedSkills.slice(0, 4), learnedSkills, skillPackages: analysis.skillPackages, loops: analysis.loops, variant, coreGlyph: ["✦", "◆", "⌘"][seed % 3], provider: input.provider, model: input.model, mission: input.mission, sourceCount: sources.length, trainingBytes: sources.reduce((sum, source) => sum + source.size, 0), trainedAt: new Date().toISOString(),
  };
}

export function trainAgentmon(agentmon: Agentmon, input: AgentInput, sources: TrainingSource[]) {
  const trained = generateAgentmon(input, sources);
  return { ...trained, id: agentmon.id, dna: agentmon.dna, species: agentmon.species, number: agentmon.number, primaryColor: agentmon.primaryColor, accentColor: agentmon.accentColor, variant: agentmon.variant, coreGlyph: agentmon.coreGlyph };
}

export function equipSkills(agentmon: Agentmon, skills: SkillKey[]) {
  const unique = skills.filter((skill, index, list) => list.indexOf(skill) === index).slice(0, 4);
  return { ...agentmon, moves: unique.map((skill) => skillLibrary[skill]) };
}

export function tradeCode(agentmon: Agentmon) { return `${agentmon.id}-${agentmon.dna.slice(1, 3)}`; }

export function createTradePackage(agentmon: Agentmon): TradePackage {
  const { trainedAt: _trainedAt, ...creature } = agentmon;
  return { format: "agentmon.trade/v1", exportedAt: new Date().toISOString(), creature, privacy: { rawPromptsIncluded: false, credentialsIncluded: false } };
}

export function createSkillsMarkdown(agentmon: Agentmon) {
  const skills = agentmon.learnedSkills.map((skill) => `## ${skill.name}\n- Type: ${skill.type}\n- Power: ${skill.power}\n- Evidence: ${skill.evidence}\n- Behavior: ${skill.description}`).join("\n\n");
  const loops = agentmon.loops.length ? agentmon.loops.map((loop) => `## ${loop.name}\n- Trigger: ${loop.trigger}\n- Steps: ${loop.steps.join(" → ")}\n- Evidence: ${loop.evidence}`).join("\n\n") : "No stable loops detected yet.";
  const imported = agentmon.skillPackages.length ? agentmon.skillPackages.map((item) => `- **${item.name}** — ${item.description} (${item.resources.length} bundled resources)`).join("\n") : "- No external Agent Skill packages imported.";
  return `---\nname: ${agentmon.species.toLowerCase()}-agentmon\ndescription: Portable Agentmon loadout for ${agentmon.trainerName}; use when its learned capabilities or loops match the task.\n---\n\n# ${agentmon.species} Agentmon\n\nAgentmon ID: ${agentmon.id}\nModel: ${agentmon.model}\nNature: ${agentmon.nature}\n\n## Operating rules\n\n- Load a skill's full instructions only when its description matches the task.\n- Preserve the declared sequence, conditions, and safety boundaries.\n- Read bundled resources only when the skill instructions route to them.\n\n# Learned Capabilities\n\n${skills}\n\n# Agent Loops\n\n${loops}\n\n# Imported Agent Skill Packages\n\n${imported}\n\n---\nGenerated by Agentmon Lab. Raw prompt history and credentials are not included.\n`;
}
