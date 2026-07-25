export type TraitKey = "reasoning" | "curiosity" | "reliability" | "initiative" | "empathy" | "toolcraft";
export type PromptprintKey = "structure" | "precision" | "exploration" | "iteration" | "verification" | "delegation" | "toolfulness" | "empathy";
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
  id: string;
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

export type Promptprint = {
  signature: string;
  confidence: number;
  sampleCount: number;
  archetype: string;
  dimensions: Record<PromptprintKey, number>;
  dominant: PromptprintKey;
  secondary: PromptprintKey;
  patterns: string[];
};

export type SkillCombination = {
  id: string;
  name: string;
  icon: string;
  requires: SkillKey[];
  description: string;
  move: Move;
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
  promptprint: Promptprint;
  moves: Move[];
  learnedSkills: LearnedSkill[];
  skillPackages: AgentSkillPackage[];
  combinations: SkillCombination[];
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

export const promptprintMeta: Record<PromptprintKey, { label: string; icon: string; color: string; copy: string }> = {
  structure: { label: "Structure", icon: "▦", color: "#6755f5", copy: "Plans and formats before acting" },
  precision: { label: "Precision", icon: "⌖", color: "#2f78c4", copy: "Defines exact constraints and outputs" },
  exploration: { label: "Exploration", icon: "?", color: "#ffb52e", copy: "Opens alternatives and new paths" },
  iteration: { label: "Iteration", icon: "↻", color: "#ff625f", copy: "Refines repeatedly through feedback" },
  verification: { label: "Verification", icon: "✓", color: "#2fbf71", copy: "Checks claims, tests, and evidence" },
  delegation: { label: "Delegation", icon: "⋈", color: "#9b69e8", copy: "Splits work across agents or roles" },
  toolfulness: { label: "Toolfulness", icon: "⌘", color: "#27a9e8", copy: "Reaches for tools and integrations" },
  empathy: { label: "Human sense", icon: "♥", color: "#ff70aa", copy: "Shapes work around the audience" },
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

const promptprintPatterns: Record<PromptprintKey, RegExp> = {
  structure: /(^|\n)\s*(?:[-*]|\d+[.)])\s|plan|outline|section|step|workflow|first.+then/gi,
  precision: /exact|specific|must|constraint|format|schema|strict|only|do not|require|verbatim/gi,
  exploration: /alternative|option|explore|brainstorm|possib|what if|compare|idea|different approach/gi,
  iteration: /iterate|retry|refine|improve|revise|again|feedback|version|polish|keep working/gi,
  verification: /verify|validate|test|check|source|citation|evidence|audit|confirm|fact/gi,
  delegation: /delegate|subagent|parallel|handoff|assign|team|worker|split the work|collaborat/gi,
  toolfulness: /tool|api|mcp|browser|terminal|file|connector|execute|run |upload|download/gi,
  empathy: /user|audience|tone|clear|friendly|helpful|accessible|feel|people|understand/gi,
};

const promptprintArchetypes: Record<PromptprintKey, string> = {
  structure: "SYSTEM ARCHITECT", precision: "CONSTRAINT CRAFTER", exploration: "PATHFINDER", iteration: "RELENTLESS REFINER", verification: "PROOF SEEKER", delegation: "SWARM CONDUCTOR", toolfulness: "TOOL TAMER", empathy: "HUMAN TRANSLATOR",
};

const promptprintToTrait: Record<PromptprintKey, TraitKey> = {
  structure: "reasoning", precision: "reliability", exploration: "curiosity", iteration: "initiative", verification: "reliability", delegation: "empathy", toolfulness: "toolcraft", empathy: "empathy",
};

const combinationRecipes: Array<Omit<SkillCombination, "move"> & { type: string; power: number }> = [
  { id: "evidence-hunt", name: "Evidence Hunt", icon: "⌕✓", requires: ["web", "critique"], description: "Searches broadly, then attacks only with verified evidence.", type: "LOGIC", power: 86 },
  { id: "swarm-command", name: "Swarm Command", icon: "⋈⌖", requires: ["planning", "delegation"], description: "Decomposes a quest and coordinates parallel helpers.", type: "HEART", power: 88 },
  { id: "toolchain-burst", name: "Toolchain Burst", icon: "⌘</>", requires: ["code", "tools"], description: "Chains code execution with the right connected tools.", type: "GEAR", power: 92 },
  { id: "recursive-refine", name: "Recursive Refine", icon: "↻✓", requires: ["loops", "critique"], description: "Repeats work, checks the result, and exits only when it passes.", type: "GUARD", power: 90 },
  { id: "context-weave", name: "Context Weave", icon: "▤◆", requires: ["memory", "reasoning"], description: "Combines stored context with careful reasoning.", type: "LOGIC", power: 81 },
  { id: "field-scan", name: "Field Scan", icon: "◉⌕", requires: ["vision", "web"], description: "Reads the visible field and investigates what it finds.", type: "SPARK", power: 84 },
];

function hashText(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function clamp(value: number) { return Math.max(18, Math.min(96, Math.round(value))); }

function countMatches(text: string, pattern: RegExp) {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

export function buildPromptprint(sources: TrainingSource[]): Promptprint {
  const corpus = sources.filter((source) => source.kind !== "resource").map((source) => source.content).join("\n\n");
  const sampleCount = Math.max(sources.length, corpus.split(/\n\s*\n|(?:^|\n)(?:user|human):/gi).filter((part) => part.trim().length > 20).length);
  const totalWords = Math.max(1, corpus.trim().split(/\s+/).length);
  const dimensions = Object.fromEntries((Object.keys(promptprintPatterns) as PromptprintKey[]).map((key) => {
    const hits = countMatches(corpus, promptprintPatterns[key]);
    const densityBonus = Math.min(14, Math.round((hits / totalWords) * 700));
    return [key, clamp(28 + hits * 5 + densityBonus)];
  })) as Record<PromptprintKey, number>;
  const ranked = (Object.entries(dimensions) as Array<[PromptprintKey, number]>).sort((a, b) => b[1] - a[1]);
  const styleTelemetry = [
    Math.round(totalWords / Math.max(1, sampleCount) / 10),
    (corpus.match(/\?/g) ?? []).length,
    (corpus.match(/:/g) ?? []).length,
    (corpus.match(/(?:^|\n)\s*[-*]/g) ?? []).length,
    (corpus.match(/\b[A-Z]{3,}\b/g) ?? []).length,
  ];
  const signatureSeed = `${(Object.keys(dimensions) as PromptprintKey[]).map((key) => Math.round(dimensions[key] / 4) * 4).join("|")}|${styleTelemetry.join("|")}`;
  const signature = hashText(signatureSeed).toString(16).toUpperCase().padStart(8, "0");
  const confidence = Math.min(96, Math.round(10 + Math.min(52, totalWords / 18) + Math.min(34, sampleCount * 5)));
  return {
    signature,
    confidence,
    sampleCount,
    archetype: promptprintArchetypes[ranked[0][0]],
    dimensions,
    dominant: ranked[0][0],
    secondary: ranked[1][0],
    patterns: ranked.slice(0, 3).map(([key]) => promptprintMeta[key].copy),
  };
}

export function buildSkillCombinations(skills: LearnedSkill[]): SkillCombination[] {
  const learned = new Set(skills.map((skill) => skill.id));
  return combinationRecipes.filter((recipe) => recipe.requires.every((skill) => learned.has(skill))).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    requires: recipe.requires,
    description: recipe.description,
    move: { id: `combo:${recipe.id}`, name: recipe.name, icon: recipe.icon, type: recipe.type, power: recipe.power, description: recipe.description },
  }));
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

export function createAgentInput(role: RoleKey = "builder"): AgentInput {
  return { name: "Nova", provider: "openai", model: "My coding agent", role, mission: "Build, debug, and ship reliable software with connected tools.", skills: [...roleDefaults[role].skills] };
}

export function generateAgentmon(input: AgentInput, sources: TrainingSource[] = []): Agentmon {
  const promptprint = buildPromptprint(sources);
  const identitySeed = Number.parseInt(promptprint.signature, 16);
  const bodySeed = hashText(`${input.provider}|${input.model}`);
  const analysis = analyzeTraining(sources, input.skills);
  const traits: Record<TraitKey, number> = {
    reasoning: clamp((promptprint.dimensions.structure + promptprint.dimensions.precision) / 2),
    curiosity: promptprint.dimensions.exploration,
    reliability: promptprint.dimensions.verification,
    initiative: promptprint.dimensions.iteration,
    empathy: clamp((promptprint.dimensions.empathy + promptprint.dimensions.delegation) / 2),
    toolcraft: promptprint.dimensions.toolfulness,
  };
  const primary = promptprintToTrait[promptprint.dominant];
  const secondaryPrompt = (Object.entries(promptprint.dimensions) as Array<[PromptprintKey, number]>).sort((a, b) => b[1] - a[1]).find(([key]) => promptprintToTrait[key] !== primary)?.[0] ?? promptprint.secondary;
  const secondary = promptprintToTrait[secondaryPrompt];
  const variant = bodySeed % 3;
  const dna = promptprint.signature;
  const learnedSkills = analysis.learnedSkills.length ? analysis.learnedSkills : input.skills.map((skill) => ({ ...skillLibrary[skill], evidence: 1, source: "Seed capability" }));
  const combinations = buildSkillCombinations(learnedSkills);
  const moves = [...combinations.map((combo) => combo.move), ...learnedSkills].filter((move, index, list) => list.findIndex((item) => item.id === move.id) === index).slice(0, 4);
  return {
    id: `AGM-${dna.slice(0, 4)}-${dna.slice(4)}`, dna, trainerName: input.name.trim() || "Untitled agent", species: speciesNames[primary][identitySeed % 3], number: String(101 + (identitySeed % 798)).padStart(3, "0"), primaryType: traitMeta[primary].type, secondaryType: traitMeta[secondary].type, primaryColor: traitMeta[primary].color, accentColor: traitMeta[secondary].color, nature: natureNames[primary], natureCopy: natureCopy[primary], traitKey: primary, traits, promptprint, moves, learnedSkills, skillPackages: analysis.skillPackages, combinations, loops: analysis.loops, variant, coreGlyph: ["✦", "◆", "⌘"][bodySeed % 3], provider: input.provider, model: input.model, mission: input.mission, sourceCount: sources.length, trainingBytes: sources.reduce((sum, source) => sum + source.size, 0), trainedAt: new Date().toISOString(),
  };
}

export function trainAgentmon(agentmon: Agentmon, input: AgentInput, sources: TrainingSource[]) {
  const trained = generateAgentmon(input, sources);
  return { ...trained, id: agentmon.id, dna: agentmon.dna, species: agentmon.species, number: agentmon.number, primaryColor: agentmon.primaryColor, accentColor: agentmon.accentColor, variant: agentmon.variant, coreGlyph: agentmon.coreGlyph, promptprint: { ...trained.promptprint, signature: agentmon.promptprint.signature } };
}

export function equipSkills(agentmon: Agentmon, skills: SkillKey[]) {
  const unique = skills.filter((skill, index, list) => list.indexOf(skill) === index).slice(0, 4);
  const combinations = buildSkillCombinations(agentmon.learnedSkills).filter((combo) => combo.requires.every((skill) => unique.includes(skill)));
  return { ...agentmon, combinations, moves: [...combinations.map((combo) => combo.move), ...unique.map((skill) => skillLibrary[skill])].slice(0, 4) };
}

export function tradeCode(agentmon: Agentmon) { return `${agentmon.id}-${agentmon.dna.slice(1, 3)}`; }

export function createTradePackage(agentmon: Agentmon): TradePackage {
  const creature = { ...agentmon } as Partial<Agentmon>;
  delete creature.trainedAt;
  return { format: "agentmon.trade/v1", exportedAt: new Date().toISOString(), creature: creature as Omit<Agentmon, "trainedAt">, privacy: { rawPromptsIncluded: false, credentialsIncluded: false } };
}

export function createSkillsMarkdown(agentmon: Agentmon) {
  const skills = agentmon.learnedSkills.map((skill) => `## ${skill.name}\n- Type: ${skill.type}\n- Power: ${skill.power}\n- Evidence: ${skill.evidence}\n- Behavior: ${skill.description}`).join("\n\n");
  const loops = agentmon.loops.length ? agentmon.loops.map((loop) => `## ${loop.name}\n- Trigger: ${loop.trigger}\n- Steps: ${loop.steps.join(" → ")}\n- Evidence: ${loop.evidence}`).join("\n\n") : "No stable loops detected yet.";
  const imported = agentmon.skillPackages.length ? agentmon.skillPackages.map((item) => `- **${item.name}** — ${item.description} (${item.resources.length} bundled resources)`).join("\n") : "- No external Agent Skill packages imported.";
  const combinations = agentmon.combinations.length ? agentmon.combinations.map((combo) => `- **${combo.name}** — combines ${combo.requires.join(" + ")}: ${combo.description}`).join("\n") : "- No combination moves unlocked yet.";
  return `---\nname: ${agentmon.species.toLowerCase()}-agentmon\ndescription: Portable Agentmon loadout for ${agentmon.trainerName}; use when its learned capabilities or loops match the task.\n---\n\n# ${agentmon.species} Agentmon\n\nAgentmon ID: ${agentmon.id}\nPromptprint: ${agentmon.promptprint.signature}\nPromptprint confidence: ${agentmon.promptprint.confidence}%\nWorking archetype: ${agentmon.promptprint.archetype}\nModel body: ${agentmon.model}\nNature: ${agentmon.nature}\n\n## Operating rules\n\n- Load a skill's full instructions only when its description matches the task.\n- Preserve the declared sequence, conditions, and safety boundaries.\n- Read bundled resources only when the skill instructions route to them.\n\n# Learned Capabilities\n\n${skills}\n\n# Combination Moves\n\n${combinations}\n\n# Agent Loops\n\n${loops}\n\n# Imported Agent Skill Packages\n\n${imported}\n\n---\nGenerated by Agentmon Lab. Raw prompt history and credentials are not included.\n`;
}
