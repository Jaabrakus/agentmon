// plugins/agentmon-codex/lib/engine/catalog.ts
var traitMeta = {
  reasoning: { label: "Reasoning", icon: "\u25C6", color: "#6b5cff", type: "LOGIC" },
  curiosity: { label: "Curiosity", icon: "?", color: "#ffb52e", type: "SPARK" },
  reliability: { label: "Reliability", icon: "\u25A3", color: "#2fbf71", type: "GUARD" },
  initiative: { label: "Initiative", icon: "\u219F", color: "#ff625f", type: "BOLT" },
  empathy: { label: "Empathy", icon: "\u2665", color: "#ff70aa", type: "HEART" },
  toolcraft: { label: "Toolcraft", icon: "\u2318", color: "#27a9e8", type: "GEAR" }
};
var promptprintMeta = {
  structure: { label: "Structure", icon: "\u25A6", color: "#6755f5", copy: "Plans and formats before acting" },
  precision: { label: "Precision", icon: "\u2316", color: "#2f78c4", copy: "Defines exact constraints and outputs" },
  exploration: { label: "Exploration", icon: "?", color: "#ffb52e", copy: "Opens alternatives and new paths" },
  iteration: { label: "Iteration", icon: "\u21BB", color: "#ff625f", copy: "Refines repeatedly through feedback" },
  verification: { label: "Verification", icon: "\u2713", color: "#2fbf71", copy: "Checks claims, tests, and evidence" },
  delegation: { label: "Delegation", icon: "\u22C8", color: "#9b69e8", copy: "Splits work across agents or roles" },
  toolfulness: { label: "Toolfulness", icon: "\u2318", color: "#27a9e8", copy: "Reaches for tools and integrations" },
  empathy: { label: "Human sense", icon: "\u2665", color: "#ff70aa", copy: "Shapes work around the audience" }
};
var skillLibrary = {
  reasoning: { id: "reasoning", name: "Logic Lock", type: "LOGIC", power: 66, description: "Breaks complex goals into precise steps.", icon: "\u25C6" },
  web: { id: "web", name: "Web Scout", type: "SPARK", power: 54, description: "Searches live sources and brings back evidence.", icon: "\u2315" },
  code: { id: "code", name: "Code Burst", type: "GEAR", power: 72, description: "Builds, debugs, and patches software.", icon: "</>" },
  memory: { id: "memory", name: "Recall Ward", type: "GUARD", power: 48, description: "Uses stored context and preferences safely.", icon: "\u25A4" },
  tools: { id: "tools", name: "Tool Combo", type: "GEAR", power: 68, description: "Chains APIs, connectors, and MCP tools.", icon: "\u2318" },
  vision: { id: "vision", name: "Pixel Sight", type: "SPARK", power: 58, description: "Reads images, screens, and visual artifacts.", icon: "\u25C9" },
  planning: { id: "planning", name: "Quest Map", type: "LOGIC", power: 56, description: "Creates milestones and tracks the next action.", icon: "\u2316" },
  loops: { id: "loops", name: "Loop Drive", type: "BOLT", power: 74, description: "Repeats a workflow until its exit condition is met.", icon: "\u21BB" },
  delegation: { id: "delegation", name: "Swarm Call", type: "HEART", power: 64, description: "Splits work across helpers and recombines results.", icon: "\u22C8" },
  critique: { id: "critique", name: "Truth Check", type: "GUARD", power: 62, description: "Tests, reviews, and corrects weak outputs.", icon: "\u2713" }
};
var roleDefaults = {
  builder: { label: "Builder", caption: "ships code + tools", traits: { reasoning: 72, curiosity: 48, reliability: 61, initiative: 64, empathy: 34, toolcraft: 84 }, skills: ["reasoning", "code", "tools"] },
  researcher: { label: "Researcher", caption: "searches + verifies", traits: { reasoning: 76, curiosity: 86, reliability: 68, initiative: 42, empathy: 39, toolcraft: 55 }, skills: ["reasoning", "web", "critique"] },
  operator: { label: "Operator", caption: "acts + orchestrates", traits: { reasoning: 61, curiosity: 45, reliability: 74, initiative: 86, empathy: 32, toolcraft: 79 }, skills: ["tools", "planning", "loops"] },
  companion: { label: "Companion", caption: "remembers + supports", traits: { reasoning: 49, curiosity: 58, reliability: 69, initiative: 40, empathy: 89, toolcraft: 35 }, skills: ["memory", "reasoning", "vision"] }
};

// plugins/agentmon-codex/lib/engine/math.ts
function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function clamp(value) {
  return Math.max(18, Math.min(96, Math.round(value)));
}

// plugins/agentmon-codex/lib/engine/naming.ts
var nameSoundPacks = [
  { id: "open-vowel", onsets: ["m", "n", "p", "t", "k", "l", "s"], vowels: ["a", "e", "i", "o", "u"], codas: ["", "n"], templates: ["CV", "CVV"] },
  { id: "sonorant-flow", onsets: ["l", "r", "m", "n", "w", "y"], vowels: ["a", "e", "i", "o", "u", "ai"], codas: ["l", "r", "n", ""], templates: ["CVF", "CV"] },
  { id: "nasal-rhythm", onsets: ["m", "n", "ny", "ng", "b", "d"], vowels: ["a", "i", "u", "o"], codas: ["m", "n", "ng", ""], templates: ["CVF", "VC"] },
  { id: "dorsal-edge", onsets: ["k", "g", "kh", "q", "h"], vowels: ["a", "e", "o", "u", "ae"], codas: ["k", "q", "r", ""], templates: ["CVF", "CV"] },
  { id: "coronal-spark", onsets: ["t", "d", "s", "z", "sh", "ch", "ts"], vowels: ["a", "e", "i", "o"], codas: ["t", "s", "n", ""], templates: ["CVF", "CV"] },
  { id: "labial-pulse", onsets: ["p", "b", "f", "v", "m"], vowels: ["a", "e", "i", "o", "u"], codas: ["p", "m", "v", ""], templates: ["CVF", "CV"] },
  { id: "liquid-cluster", onsets: ["br", "dr", "kr", "pl", "tr", "vr", "sk"], vowels: ["a", "e", "i", "o", "u"], codas: ["r", "l", "n", ""], templates: ["CVF", "CV"] },
  { id: "vowel-weave", onsets: ["", "h", "y", "w", "l"], vowels: ["ai", "au", "ei", "ia", "oa", "ui"], codas: ["n", "l", "", "s"], templates: ["VF", "CV"] },
  { id: "breath-line", onsets: ["h", "sh", "th", "f", "s"], vowels: ["a", "e", "i", "o", "u"], codas: ["h", "s", "", "n"], templates: ["CV", "CVF"] },
  { id: "retroflex-color", onsets: ["r", "zh", "dh", "tr", "d"], vowels: ["a", "i", "u", "e"], codas: ["r", "t", "n", ""], templates: ["CVF", "CV"] },
  { id: "island-cadence", onsets: ["m", "n", "l", "r", "p", "t", "k", "v"], vowels: ["a", "e", "i", "o", "u"], codas: [""], templates: ["CV", "CVV"] },
  { id: "compact-coda", onsets: ["b", "d", "g", "k", "s", "z", "m", "n"], vowels: ["a", "e", "i", "o", "u"], codas: ["k", "t", "m", "n", "s"], templates: ["CVF", "VF"] }
];
var nameTraitPackBias = {
  reasoning: ["liquid-cluster", "compact-coda", "sonorant-flow"],
  curiosity: ["vowel-weave", "open-vowel", "coronal-spark"],
  reliability: ["compact-coda", "nasal-rhythm", "dorsal-edge"],
  initiative: ["coronal-spark", "labial-pulse", "liquid-cluster"],
  empathy: ["sonorant-flow", "island-cadence", "open-vowel"],
  toolcraft: ["dorsal-edge", "liquid-cluster", "labial-pulse"]
};
var blockedNameFragments = ["pokemon", "pikachu", "openai", "chatgpt", "fuck", "shit"];
function namePick(items, seed, salt) {
  return items[hashText(`${seed}|${salt}`) % items.length];
}
function forgeSyllable(pack, seed, index) {
  const template = namePick(pack.templates, seed, `template-${index}`);
  const onset = namePick(pack.onsets, seed, `onset-${index}`);
  const vowel = namePick(pack.vowels, seed, `vowel-${index}`);
  const coda = namePick(pack.codas, seed, `coda-${index}`);
  const syllable = [...template].map((token) => token === "C" ? onset : token === "V" ? vowel : coda).join("");
  return { syllable, template };
}
function normalizeForgedName(value) {
  const cleaned = value.toLowerCase().replace(/[^a-z]/g, "").replace(/(.)\1\1+/g, "$1$1").slice(0, 11);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
function isPortablePronounceable(name) {
  const lower = name.toLowerCase();
  const vowelCount = (lower.match(/[aeiouy]/g) || []).length;
  return lower.length >= 4 && lower.length <= 11 && vowelCount >= 2 && !/^ng|^ny/.test(lower) && !/q(?!u)/.test(lower) && !/[bcdfghjklmnpqrstvwxyz]{4}/.test(lower) && !/[aeiou]{4}/.test(lower) && !/(?:hv|vh|qk|kq|hsh|shh|zhh|thh)/.test(lower);
}
function forgeAgentmonName(seed, primary, secondary, attempt = 0) {
  const effectiveSeed = `${seed}|${primary}|${secondary}|${attempt}`;
  const biasedIds = [...nameTraitPackBias[primary], ...nameTraitPackBias[secondary]];
  const biasedPacks = biasedIds.map((id) => nameSoundPacks.find((pack) => pack.id === id)).filter(Boolean);
  const syllableCount = 2 + hashText(`${effectiveSeed}|length`) % 2;
  const soundPacks = [];
  const templates = [];
  const syllables = [];
  for (let index = 0; index < syllableCount; index += 1) {
    const pool = index === 0 ? biasedPacks : nameSoundPacks;
    const pack = namePick(pool, effectiveSeed, `pack-${index}`);
    const rendered = forgeSyllable(pack, effectiveSeed, index);
    soundPacks.push(pack.id);
    templates.push(rendered.template);
    syllables.push(rendered.syllable);
  }
  let name = normalizeForgedName(syllables.join(""));
  if (!isPortablePronounceable(name) || blockedNameFragments.some((fragment) => name.toLowerCase().includes(fragment))) {
    if (attempt >= 12) name = `Mon${hashText(effectiveSeed).toString(36).slice(0, 6)}`;
    else return forgeAgentmonName(seed, primary, secondary, attempt + 1);
  }
  return {
    format: "agentmon.nameforge/v1",
    generatorVersion: "1.0",
    name,
    seedDigest: hashText(effectiveSeed).toString(16).padStart(8, "0").toUpperCase(),
    soundPacks,
    templates,
    syllables,
    asciiSkeleton: name.toLowerCase(),
    moderation: "unreviewed"
  };
}
function generateAgentmonNameCandidates(agentmon, count = 12) {
  const primary = agentmon.traitKey;
  const secondary = Object.entries(agentmon.traits).filter(([trait]) => trait !== primary).sort((left, right) => right[1] - left[1])[0]?.[0] ?? primary;
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (let index = 0; candidates.length < Math.max(1, Math.min(50, count)) && index < count * 8; index += 1) {
    const candidate = forgeAgentmonName(`${agentmon.lineage?.genesisDNA ?? agentmon.dna}|${agentmon.trainerName}|candidate-${index}`, primary, secondary);
    if (!seen.has(candidate.asciiSkeleton)) {
      seen.add(candidate.asciiSkeleton);
      candidates.push(candidate);
    }
  }
  return candidates;
}
function reforgeAgentmonName(agentmon, candidateNumber = 1) {
  const boundedCandidate = Math.max(1, Math.min(50, Math.floor(candidateNumber)));
  const profile = generateAgentmonNameCandidates(agentmon, boundedCandidate)[boundedCandidate - 1];
  if (!profile) throw new Error(`Could not forge name candidate ${boundedCandidate}.`);
  const previousName = agentmon.form ?? agentmon.species;
  const form = !agentmon.form || agentmon.form === agentmon.species ? profile.name : agentmon.form.replace(agentmon.species, profile.name);
  return {
    ...agentmon,
    species: profile.name,
    form,
    nameForge: profile,
    trainedAt: (/* @__PURE__ */ new Date()).toISOString(),
    nameHistory: [...agentmon.nameHistory ?? [], { name: previousName, at: agentmon.trainedAt }]
  };
}

// plugins/agentmon-codex/lib/engine/procedure-routing.ts
function boundedPhrases(values, label, maximum) {
  if (!Array.isArray(values) || values.length > maximum) throw new Error(`${label} must contain at most ${maximum} phrases.`);
  const phrases = [...new Set(values.map((value) => String(value || "").trim().toLowerCase()))];
  if (phrases.some((value) => !value || value.length > 120)) throw new Error(`${label} phrases must contain 1-120 characters.`);
  return phrases;
}
function validateProcedureRoutingPolicy(input) {
  if (input == null) return void 0;
  if (!input || typeof input !== "object" || input.version !== 1) throw new Error("Procedure routing policy must use version 1.");
  const source = input;
  const groups = source.requiredConceptGroups == null ? [] : source.requiredConceptGroups;
  if (!Array.isArray(groups) || groups.length > 6) throw new Error("Procedure routing policy supports at most six required concept groups.");
  const requiredConceptGroups = groups.map((group, index) => boundedPhrases(group, `Routing concept group ${index + 1}`, 12));
  if (requiredConceptGroups.some((group) => !group.length)) throw new Error("Routing concept groups cannot be empty.");
  const excludedConcepts = source.excludedConcepts == null ? [] : boundedPhrases(source.excludedConcepts, "Routing exclusions", 24);
  const minimumMatchedConcepts = Math.max(1, Math.min(12, Math.round(Number(source.minimumMatchedConcepts) || 1)));
  const minimumRelevance = Math.max(1, Math.min(100, Math.round(Number(source.minimumRelevance) || 1)));
  return { version: 1, requiredConceptGroups, excludedConcepts, minimumMatchedConcepts, minimumRelevance };
}

// plugins/agentmon-codex/lib/engine/recipes.ts
var natureNames = { reasoning: "METHODICAL", curiosity: "INQUISITIVE", reliability: "STEADFAST", initiative: "BOLD", empathy: "ATTENTIVE", toolcraft: "RESOURCEFUL" };
var natureCopy = { reasoning: "Maps the whole problem before making a move.", curiosity: "Investigates every strange path it finds.", reliability: "Protects the team with consistent answers.", initiative: "Leaps into action before the field settles.", empathy: "Reads its trainer and adapts with care.", toolcraft: "Collects useful tools and combines them creatively." };
var skillPatterns = {
  reasoning: /reason|analy[sz]|step[- ]by[- ]step|deduc|compare|tradeoff|think through/gi,
  web: /search|browse|source|citation|research|url|https?:\/\//gi,
  code: /\bbuild\b|code|debug|implement|patch|function|class |typescript|javascript|python|sql|npm |git |compile|tests?|test suite/gi,
  memory: /remember|memory|context|history|preference|recall|knowledge base/gi,
  tools: /\btools?\b|tool call|function call|api |mcp|connector|terminal|execute|integration/gi,
  vision: /image|visual|screenshot|camera|diagram|pixel|render/gi,
  planning: /plan|todo|milestone|roadmap|next step|first.+then|step [0-9]/gi,
  loops: /loop|iterate|retry|until|repeat|monitor|poll|reflect|recurring/gi,
  delegation: /delegate|subagent|parallel|handoff|worker|swarm|team of agents/gi,
  critique: /verify|review|validate|double-check|critique|audit|quality check|fact-check/gi
};
var promptprintPatterns = {
  structure: /(^|\n)\s*(?:[-*]|\d+[.)])\s|plan|outline|section|step|workflow|first.+then/gi,
  precision: /exact|specific|must|constraint|format|schema|strict|only|do not|require|verbatim/gi,
  exploration: /alternative|option|explore|brainstorm|possib|what if|compare|idea|different approach/gi,
  iteration: /iterate|retry|refine|improve|revise|again|feedback|version|polish|keep working/gi,
  verification: /verify|validate|test|check|source|citation|evidence|audit|confirm|fact/gi,
  delegation: /delegate|subagent|parallel|handoff|assign|team|worker|split the work|collaborat/gi,
  toolfulness: /tool|api|mcp|browser|terminal|file|connector|execute|run |upload|download/gi,
  empathy: /user|audience|tone|clear|friendly|helpful|accessible|feel|people|understand/gi
};
var archetypeVoices = {
  structure: ["SYSTEM", "PATTERN", "QUEST", "BLUEPRINT"],
  precision: ["EXACT", "BOUNDARY", "SIGNAL", "DETAIL"],
  exploration: ["FRONTIER", "WONDER", "POSSIBILITY", "WILDPATH"],
  iteration: ["RECURSIVE", "RELENTLESS", "VERSION", "REFINING"],
  verification: ["PROOF", "EVIDENCE", "TRUTH", "CHECKPOINT"],
  delegation: ["SWARM", "SQUAD", "CHORUS", "TEAM"],
  toolfulness: ["GEAR", "TOOLCHAIN", "INTERFACE", "MAKER"],
  empathy: ["HUMAN", "INTENT", "KINSHIP", "AUDIENCE"]
};
var archetypeForms = {
  structure: ["ARCHITECT", "CARTOGRAPHER", "WEAVER", "BUILDER"],
  precision: ["CRAFTER", "CALIBRATOR", "WARDEN", "SMITH"],
  exploration: ["PATHFINDER", "SCOUT", "SEEKER", "DREAMER"],
  iteration: ["LOOPSMITH", "REFINER", "RUNNER", "FORGER"],
  verification: ["PROVER", "AUDITOR", "KEEPER", "SENTINEL"],
  delegation: ["CONDUCTOR", "CALLER", "MARSHAL", "LINKER"],
  toolfulness: ["GEARSMITH", "TAMER", "BINDER", "ENGINEER"],
  empathy: ["TRANSLATOR", "LISTENER", "GUIDE", "ALLY"]
};
var promptprintToTrait = {
  structure: "reasoning",
  precision: "reliability",
  exploration: "curiosity",
  iteration: "initiative",
  verification: "reliability",
  delegation: "empathy",
  toolfulness: "toolcraft",
  empathy: "empathy"
};
var combinationRecipes = [
  { id: "evidence-hunt", name: "Evidence Hunt", icon: "\u2315\u2713", requires: ["web", "critique"], description: "Searches broadly, then attacks only with verified evidence.", type: "LOGIC", power: 86 },
  { id: "swarm-command", name: "Swarm Command", icon: "\u22C8\u2316", requires: ["planning", "delegation"], description: "Decomposes a quest and coordinates parallel helpers.", type: "HEART", power: 88 },
  { id: "toolchain-burst", name: "Toolchain Burst", icon: "\u2318</>", requires: ["code", "tools"], description: "Chains code execution with the right connected tools.", type: "GEAR", power: 92 },
  { id: "recursive-refine", name: "Recursive Refine", icon: "\u21BB\u2713", requires: ["loops", "critique"], description: "Repeats work, checks the result, and exits only when it passes.", type: "GUARD", power: 90 },
  { id: "context-weave", name: "Context Weave", icon: "\u25A4\u25C6", requires: ["memory", "reasoning"], description: "Combines stored context with careful reasoning.", type: "LOGIC", power: 81 },
  { id: "field-scan", name: "Field Scan", icon: "\u25C9\u2315", requires: ["vision", "web"], description: "Reads the visible field and investigates what it finds.", type: "SPARK", power: 84 }
];
var procedureRecipes = [
  {
    id: "focused-implementation",
    name: "Focused Implementation",
    description: "Translate a concrete build request into a bounded, inspectable implementation result.",
    requires: ["code"],
    trigger: "A user asks to build, implement, patch, debug, or test software.",
    inputs: ["Requested outcome", "Relevant code context", "Acceptance condition"],
    steps: ["Inspect the relevant code surface", "State the smallest change that satisfies the request", "Implement within the approved scope", "Inspect or test the result", "Return the outcome with verification status"],
    completionCriteria: ["The requested outcome is implemented", "The result is inspected or tested", "Unverified assumptions are disclosed"],
    failureRules: ["Stop when the required code or permission is unavailable", "Do not overwrite unrelated work", "Do not claim an unrun check passed"],
    permissions: ["read-files", "write-files", "run-tools"]
  },
  {
    id: "tool-assisted-build",
    name: "Tool-Assisted Build",
    description: "Turn a bounded implementation request into a verified software change.",
    requires: ["code", "tools"],
    trigger: "A user assigns a concrete implementation, debugging, or code-change task.",
    inputs: ["Objective and constraints", "Relevant repository or files", "Required quality gates"],
    steps: ["Inspect the smallest relevant surface", "Choose a bounded implementation path", "Make the change with approved tools", "Run the relevant checks", "Report the result and remaining uncertainty"],
    completionCriteria: ["The requested change exists", "Relevant checks pass or failures are reported with evidence", "No unrelated user work is overwritten"],
    failureRules: ["Stop when required access or authority is missing", "Do not claim success without a check or inspectable result"],
    permissions: ["read-files", "write-files", "run-tools"]
  },
  {
    id: "research-proof",
    name: "Research Proof Loop",
    description: "Investigate a live or uncertain claim and return a source-backed synthesis.",
    requires: ["web", "critique"],
    trigger: "A claim is current, uncertain, high-stakes, or explicitly needs sources.",
    inputs: ["Question or claim", "Freshness requirement", "Preferred source constraints"],
    steps: ["Search authoritative sources", "Open the primary evidence", "Cross-check material claims", "Separate facts from inference", "Synthesize with direct citations"],
    completionCriteria: ["Material claims are supported", "Conflicts and uncertainty are visible", "Sources are directly usable"],
    failureRules: ["Do not manufacture sources", "Do not present an inference as a sourced fact"],
    permissions: ["network", "read-files"]
  },
  {
    id: "build-verify-retry",
    name: "Build Verify Retry",
    description: "Iterate on a result until a declared quality gate passes or a real blocker is reached.",
    requires: ["loops", "critique"],
    trigger: "An output can be tested, rendered, linted, reviewed, or otherwise checked.",
    inputs: ["Target result", "Quality gate", "Retry boundary"],
    steps: ["Produce the smallest viable result", "Run the quality gate", "Diagnose a failed gate", "Apply one focused correction", "Repeat or stop with evidence"],
    completionCriteria: ["The quality gate passes", "Any unverified area is named explicitly"],
    failureRules: ["Do not loop without new evidence", "Stop when retries would exceed scope, permission, or budget"],
    permissions: ["read-files", "write-files", "run-tools"]
  },
  {
    id: "squad-orchestration",
    name: "Squad Orchestration",
    description: "Split independent work across agents and reconcile it into one result.",
    requires: ["delegation", "planning"],
    trigger: "A task has multiple bounded tracks that can progress independently.",
    inputs: ["Shared objective", "Independent work tracks", "Integration criteria"],
    steps: ["Decompose only independent tracks", "Assign clear inputs and outputs", "Collect results", "Resolve overlap and contradictions", "Verify the integrated result"],
    completionCriteria: ["Every assigned track is accounted for", "The combined output is coherent and checked"],
    failureRules: ["Do not delegate work that requires unavailable context", "Do not treat an unreviewed sub-result as final"],
    permissions: ["delegate", "read-files", "write-files"]
  },
  {
    id: "context-preservation",
    name: "Context Preservation",
    description: "Use durable project context without silently converting guesses into memory.",
    requires: ["memory", "reasoning"],
    trigger: "A returning user or project depends on earlier decisions or preferences.",
    inputs: ["Current request", "Approved stored context", "Potentially stale assumptions"],
    steps: ["Retrieve only relevant context", "Distinguish recorded facts from inference", "Confirm stale or consequential assumptions", "Apply context to the task", "Update memory only with permission"],
    completionCriteria: ["Relevant context is applied accurately", "Uncertain memory is not stated as fact"],
    failureRules: ["Never expose another user or project's context", "Do not store sensitive content without explicit permission"],
    permissions: ["memory", "read-files"]
  },
  {
    id: "visual-investigation",
    name: "Visual Investigation",
    description: "Inspect a visual artifact and corroborate uncertain details before acting on them.",
    requires: ["vision", "web"],
    trigger: "A screenshot, image, render, or visual reference contains task-relevant evidence.",
    inputs: ["Visual artifact", "Question to answer", "Allowed external lookup scope"],
    steps: ["Inspect the original artifact", "Extract visible facts", "Mark ambiguous details", "Corroborate externally when allowed", "Return findings with confidence"],
    completionCriteria: ["Visible facts and inferences are separated", "Important ambiguity is reported"],
    failureRules: ["Do not infer hidden content", "Do not identify people or sensitive attributes without authorization"],
    permissions: ["read-files", "network"]
  }
];

// plugins/agentmon-codex/lib/engine/training.ts
function buildPersonalArchetype(dominant, secondary, signatureSeed) {
  const seed = hashText(`${signatureSeed}|${dominant}|${secondary}|archetype`);
  const voices = archetypeVoices[dominant];
  const forms = archetypeForms[secondary];
  return `${voices[seed % voices.length]} ${forms[Math.floor(seed / voices.length) % forms.length]}`;
}
function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}
var intentWeights = {
  "personal-preference": 1,
  directive: 0.9,
  "product-spec": 0.25,
  brainstorm: 0.2,
  question: 0.15,
  reference: 0.05
};
var stageRank = { observed: 0, hypothesis: 1, validated: 2, learned: 3 };
function classifyPromptIntent(source) {
  const text = source.content.trim();
  const lower = text.toLowerCase();
  if (source.kind === "skills" || source.kind === "resource" || /```/.test(text) && text.split("\n").length > 8) return { intent: "reference", confidence: 92 };
  if (/\b(imagine|what if|i wonder|maybe|perhaps|brainstorm|could we|it would be interesting)\b/i.test(text)) return { intent: "brainstorm", confidence: 86 };
  if (/\b(i prefer|i always|i tend to|i work best|for me|please always|please never|don't|do not|no no|focus)\b/i.test(text)) return { intent: "personal-preference", confidence: 88 };
  if (/\?$/.test(text) || /\b(how|what|why|when|where|who|would|should|can|could|is it|are we)\b/i.test(text) && text.includes("?")) return { intent: "question", confidence: 86 };
  if (/^(?:(?:okay|ok)\s+)?(?:(?:let'?s\s+)|(?:please\s+))?(?:do it|build|create|make|implement|fix|debug|run|check|verify|search|research|open|cross-check|inspect|update|write|add|remove|show|use|ship|continue|enhance)\b/i.test(text)) return { intent: "directive", confidence: 90 };
  const productTerms = /\b(agentmon|agentmons|app|engine|feature|database|backend|frontend|user|users|product|game|plugin|addon|desktop|cloud|supabase|trading card)\b/i;
  const specificationTerms = /\b(the goal|we need|we want|should|must|require|build|make|add|support|version)\b/i;
  if (productTerms.test(text) && specificationTerms.test(text)) return { intent: "product-spec", confidence: 90 };
  if (productTerms.test(text)) return { intent: "product-spec", confidence: 72 };
  if (/\b(i|my|we|our|let's|lets)\b/i.test(lower)) return { intent: "personal-preference", confidence: 62 };
  return { intent: "reference", confidence: 55 };
}
function observeTrainingSources(sources) {
  return sources.filter((source) => source.kind !== "resource" || source.content.trim()).map((source) => {
    const classified = classifyPromptIntent(source);
    const intent = source.intentOverride ?? classified.intent;
    const confidence = source.intentOverride ? 100 : classified.confidence;
    const signals = Object.keys(skillPatterns).filter((skill) => countMatches(source.content, skillPatterns[skill]) > 0);
    const imperativeStart = /^(?:(?:okay|ok)\s+)?(?:(?:let'?s\s+)|(?:please\s+))?(?:do it|build|create|make|implement|fix|debug|run|check|verify|search|research|open|cross-check|inspect|update|write|add|remove|show|use|ship|continue|enhance)\b/i.test(source.content.trim());
    const learningWeight = intentWeights[intent];
    return {
      sourceId: source.id,
      digest: hashText(`${source.kind}|${source.id}|${source.content}`).toString(16).padStart(8, "0").toUpperCase(),
      intent,
      engineIntent: classified.intent,
      classificationSource: source.intentOverride ? "trainer" : "engine",
      confidence,
      learningWeight,
      signals,
      decisionContext: {
        known: { sourceKind: source.kind, characters: source.size, hasQuestionMark: source.content.includes("?"), imperativeStart, signals },
        unknown: ["Trainer's intended long-term habit", "Task outcome", "Whether the resulting answer was accepted or corrected"],
        estimates: { intent, confidence, learningWeight }
      }
    };
  });
}
function buildDecisionEpisodes(observations) {
  return observations.map((observation) => ({
    id: `episode-${observation.digest}`,
    sourceId: observation.sourceId,
    digest: observation.digest,
    context: observation.decisionContext,
    prediction: { intent: observation.intent, engineIntent: observation.engineIntent, confidence: observation.confidence },
    resolution: observation.classificationSource === "trainer" ? { status: "trainer-corrected", correctedIntent: observation.intent } : { status: "unreviewed" }
  }));
}
function candidateStage(evidenceCount, behavioralEvidenceCount, weightedEvidence) {
  if (evidenceCount >= 4 && behavioralEvidenceCount >= 3 && weightedEvidence >= 3.4) return "learned";
  if (evidenceCount >= 3 && behavioralEvidenceCount >= 2 && weightedEvidence >= 2.2) return "validated";
  if (evidenceCount >= 2 && behavioralEvidenceCount >= 1 && weightedEvidence >= 1.1) return "hypothesis";
  return "observed";
}
function buildSkillCandidates(observations) {
  return Object.keys(skillLibrary).flatMap((skill) => {
    const evidence = observations.filter((observation) => observation.signals.includes(skill));
    if (!evidence.length) return [];
    const behavioral = evidence.filter((observation) => observation.intent === "directive" || observation.intent === "personal-preference");
    const weightedEvidence = Number(evidence.reduce((sum, observation) => sum + observation.learningWeight, 0).toFixed(2));
    const stage = candidateStage(evidence.length, behavioral.length, weightedEvidence);
    const positiveIntents = [...new Set(evidence.map((observation) => observation.intent))];
    const confidence = Math.min(96, Math.round(18 + weightedEvidence * 14 + behavioral.length * 7 + Math.min(12, evidence.length * 2)));
    return [{
      id: skill,
      name: skillLibrary[skill].name,
      stage,
      confidence,
      evidenceCount: evidence.length,
      behavioralEvidenceCount: behavioral.length,
      weightedEvidence,
      sourceDigests: evidence.map((observation) => observation.digest),
      positiveIntents,
      reason: behavioral.length ? `${behavioral.length} behavioral prompt${behavioral.length === 1 ? "" : "s"} plus ${evidence.length - behavioral.length} contextual prompt${evidence.length - behavioral.length === 1 ? "" : "s"}.` : "Seen only in questions, brainstorming, product specifications, or reference material; not yet treated as trainer behavior."
    }];
  }).sort((left, right) => stageRank[right.stage] - stageRank[left.stage] || right.weightedEvidence - left.weightedEvidence);
}
function buildBehaviorHypotheses(candidates, observations) {
  return candidates.map((candidate) => {
    const evidenceFor = observations.filter((observation) => candidate.sourceDigests.includes(observation.digest) && (observation.intent === "directive" || observation.intent === "personal-preference")).map((observation) => observation.digest);
    const behavioralSet = new Set(evidenceFor);
    const evidenceAgainst = observations.filter((observation) => observation.signals.includes(candidate.id) && observation.classificationSource === "trainer" && (observation.engineIntent === "directive" || observation.engineIntent === "personal-preference") && observation.intent !== "directive" && observation.intent !== "personal-preference").map((observation) => observation.digest);
    const status = evidenceAgainst.length > evidenceFor.length ? "weakened" : candidate.stage === "learned" || candidate.stage === "validated" ? "strengthened" : "open";
    return {
      id: candidate.id,
      hypothesis: `${candidate.name} is a repeatable trainer behavior rather than a topic merely being discussed.`,
      confidence: candidate.confidence,
      status,
      evidenceFor,
      evidenceAgainst,
      neutralContext: candidate.sourceDigests.filter((digest2) => !behavioralSet.has(digest2)),
      guardrail: "This is a testable workflow hypothesis, not a personality diagnosis or proof of hidden reasoning."
    };
  });
}
function wilsonLowerBound(passes, trials) {
  if (!trials) return 0;
  const z = 1.96;
  const rate = passes / trials;
  const denominator = 1 + z * z / trials;
  const center = rate + z * z / (2 * trials);
  const margin = z * Math.sqrt((rate * (1 - rate) + z * z / (4 * trials)) / trials);
  return Math.max(0, Math.round((center - margin) / denominator * 100));
}
function buildArenaReport(procedures, trials = []) {
  const results = procedures.map((procedure) => {
    const summarize = (variant) => {
      const rows = trials.filter((trial) => trial.procedureId === procedure.id && trial.variant === variant && trial.source === "automatic");
      const passes = rows.filter((trial) => trial.decisionQuality === "pass").length;
      return { trials: rows.length, passes, passRate: rows.length ? Math.round(passes / rows.length * 100) : 0, lowerBound: wilsonLowerBound(passes, rows.length) };
    };
    const baseline = summarize("baseline");
    const agentmon = summarize("agentmon");
    const lift = agentmon.passRate - baseline.passRate;
    const resolved = trials.filter((trial) => trial.procedureId === procedure.id && trial.outcome !== "unknown");
    const agreements = resolved.filter((trial) => trial.decisionQuality === "pass" === (trial.outcome === "success")).length;
    const outcomeAgreement = resolved.length ? Math.round(agreements / resolved.length * 100) : null;
    let status = "untested";
    if (baseline.trials || agentmon.trials) status = "testing";
    if (baseline.trials >= 5 && agentmon.trials >= 5 && lift >= 10 && agentmon.lowerBound >= baseline.lowerBound) status = "proven";
    if (baseline.trials >= 5 && agentmon.trials >= 5 && lift <= -10) status = "regressed";
    return { procedureId: procedure.id, baseline, agentmon, lift, outcomeAgreement, status };
  });
  return { format: "agentmon.arena/v1", results, provenProcedures: results.filter((result) => result.status === "proven").length, testedProcedures: results.filter((result) => result.status !== "untested").length };
}
function reviewAgentmonProcedure(agentmon, procedureId, review) {
  if (!agentmon.proceduralSkills?.some((procedure) => procedure.id === procedureId)) throw new Error(`Unknown procedure: ${procedureId}`);
  const proceduralSkills = agentmon.proceduralSkills.map((procedure) => procedure.id === procedureId ? {
    ...procedure,
    stage: review === "confirmed" && procedure.provenance?.kind === "trainer-proposal" && stageRank[procedure.stage] < stageRank.validated ? "validated" : procedure.stage,
    trainerConfirmed: review === "confirmed",
    trainerReview: review
  } : procedure);
  return { ...agentmon, proceduralSkills, arenaReport: buildArenaReport(proceduralSkills, agentmon.procedureTrials ?? []), trainedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
function validateProcedureStrings(values, label, minimum = 1, maximum = 12) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) throw new Error(`${label} requires ${minimum}-${maximum} entries.`);
  const strings = values.map((value) => String(value || "").trim());
  if (strings.some((value) => !value || value.length > 500)) throw new Error(`${label} entries must contain 1-500 characters.`);
  return strings;
}
function proposeAgentmonProcedure(agentmon, input) {
  if (input?.format !== "agentmon.procedure-proposal/v1") throw new Error("Expected agentmon.procedure-proposal/v1.");
  const id = String(input.id || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("Procedure proposal id must use 1-64 lowercase letters, numbers, or hyphens.");
  if (agentmon.proceduralSkills?.some((procedure) => procedure.id === id)) throw new Error(`Procedure already exists: ${id}.`);
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const trigger = String(input.trigger || "").trim();
  if (!name || name.length > 100 || !description || description.length > 500 || !trigger || trigger.length > 500) {
    throw new Error("Procedure proposal requires bounded name, description, and trigger text.");
  }
  const allowedPermissions = /* @__PURE__ */ new Set(["read-files", "write-files", "run-tools", "network", "delegate", "memory"]);
  const permissions = [...new Set(validateProcedureStrings(input.permissions, "Permissions", 1, 6))];
  if (permissions.some((permission) => !allowedPermissions.has(permission))) throw new Error("Procedure proposal contains an unknown permission.");
  const behavioral = (agentmon.observations ?? []).filter((observation) => observation.intent === "directive" || observation.intent === "personal-preference");
  if (behavioral.length < 3) throw new Error("A trainer-specific proposal requires at least three behavioral observations.");
  const evidenceDigests = [...new Set(behavioral.map((observation) => observation.digest))];
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const proposal = {
    id,
    name,
    description,
    stage: "hypothesis",
    confidence: Math.min(79, 40 + evidenceDigests.length * 4),
    evidenceCount: evidenceDigests.length,
    behavioralEvidenceCount: evidenceDigests.length,
    trigger,
    routing: validateProcedureRoutingPolicy(input.routing),
    inputs: validateProcedureStrings(input.inputs, "Inputs"),
    steps: validateProcedureStrings(input.steps, "Steps", 2),
    completionCriteria: validateProcedureStrings(input.completionCriteria, "Completion criteria"),
    failureRules: validateProcedureStrings(input.failureRules, "Failure rules"),
    permissions,
    evidenceDigests,
    trainerConfirmed: false,
    trainerReview: "unreviewed",
    provenance: { kind: "trainer-proposal", version: 1, createdAt }
  };
  const proceduralSkills = [...agentmon.proceduralSkills ?? [], proposal];
  return { ...agentmon, proceduralSkills, arenaReport: buildArenaReport(proceduralSkills, agentmon.procedureTrials ?? []), trainedAt: createdAt };
}
function recordAgentmonArenaTrial(agentmon, input) {
  if (!agentmon.proceduralSkills?.some((procedure) => procedure.id === input.procedureId)) throw new Error(`Unknown procedure: ${input.procedureId}`);
  const recordedAt = (/* @__PURE__ */ new Date()).toISOString();
  const trial = {
    id: `trial-${hashText(`${agentmon.id}|${input.procedureId}|${input.variant}|${recordedAt}|${agentmon.procedureTrials?.length ?? 0}`).toString(16).padStart(8, "0")}`,
    procedureId: input.procedureId,
    variant: input.variant,
    decisionQuality: input.decisionQuality,
    outcome: input.outcome ?? "unknown",
    recordedAt,
    source: input.source ?? "manual",
    runId: input.runId
  };
  const procedureTrials = [...agentmon.procedureTrials ?? [], trial];
  return { ...agentmon, procedureTrials, arenaReport: buildArenaReport(agentmon.proceduralSkills ?? [], procedureTrials), trainedAt: recordedAt };
}
function buildProceduralSkills(candidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return procedureRecipes.flatMap((recipe) => {
    const requirements = recipe.requires.map((skill) => byId.get(skill));
    if (requirements.some((candidate) => !candidate)) return [];
    const present = requirements;
    const stage = present.reduce((lowest, candidate) => stageRank[candidate.stage] < stageRank[lowest] ? candidate.stage : lowest, present[0].stage);
    const evidenceDigests = [...new Set(present.flatMap((candidate) => candidate.sourceDigests))];
    return [{
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      stage,
      confidence: Math.round(present.reduce((sum, candidate) => sum + candidate.confidence, 0) / present.length),
      evidenceCount: Math.min(...present.map((candidate) => candidate.evidenceCount)),
      behavioralEvidenceCount: Math.min(...present.map((candidate) => candidate.behavioralEvidenceCount)),
      trigger: recipe.trigger,
      inputs: recipe.inputs,
      steps: recipe.steps,
      completionCriteria: recipe.completionCriteria,
      failureRules: recipe.failureRules,
      permissions: recipe.permissions,
      evidenceDigests,
      trainerConfirmed: false,
      trainerReview: "unreviewed",
      provenance: { kind: "recipe", version: 1 }
    }];
  }).sort((left, right) => stageRank[right.stage] - stageRank[left.stage] || right.confidence - left.confidence);
}
function isCanonicalRecipeProcedure(procedure) {
  const recipe = procedureRecipes.find((candidate) => candidate.id === procedure.id);
  if (!recipe || procedure.provenance?.kind !== "recipe" || procedure.provenance.version !== 1) return false;
  return procedure.name === recipe.name && procedure.description === recipe.description && procedure.trigger === recipe.trigger && JSON.stringify(procedure.inputs) === JSON.stringify(recipe.inputs) && JSON.stringify(procedure.steps) === JSON.stringify(recipe.steps) && JSON.stringify(procedure.completionCriteria) === JSON.stringify(recipe.completionCriteria) && JSON.stringify(procedure.failureRules) === JSON.stringify(recipe.failureRules) && JSON.stringify(procedure.permissions) === JSON.stringify(recipe.permissions);
}
function buildHatchReadiness(observations, candidates) {
  const behavioralPrompts = observations.filter((observation) => observation.intent === "directive" || observation.intent === "personal-preference").length;
  const intentDiversity = new Set(observations.map((observation) => observation.intent)).size;
  const matureCandidates = candidates.filter((candidate) => stageRank[candidate.stage] >= stageRank.hypothesis).length;
  const rawScore = Math.min(100, Math.min(10, observations.length) * 3 + Math.min(6, behavioralPrompts) * 8 + intentDiversity * 2 + matureCandidates * 8);
  const reasons = [];
  if (observations.length < 5) reasons.push(`Needs ${5 - observations.length} more distinct prompt${5 - observations.length === 1 ? "" : "s"}.`);
  if (behavioralPrompts < 3) reasons.push(`Needs ${3 - behavioralPrompts} more behavioral example${3 - behavioralPrompts === 1 ? "" : "s"}.`);
  if (matureCandidates < 2) reasons.push(`Needs ${2 - matureCandidates} more repeated capability pattern${2 - matureCandidates === 1 ? "" : "s"}.`);
  const ready = observations.length >= 5 && behavioralPrompts >= 3 && matureCandidates >= 2 && rawScore >= 60;
  const score = ready ? rawScore : Math.min(89, rawScore);
  if (!reasons.length) reasons.push("Enough distinct behavioral evidence exists for a stable hatch profile.");
  return { ready, score, reasons, distinctPrompts: observations.length, behavioralPrompts, intentDiversity };
}
function buildPromptprint(sources) {
  const observations = observeTrainingSources(sources);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const corpus = sources.filter((source) => source.kind !== "resource").map((source) => source.content).join("\n\n");
  const sampleCount = sources.filter((source) => source.kind !== "resource").length;
  const totalWords = Math.max(1, corpus.trim().split(/\s+/).length);
  const dimensions = Object.fromEntries(Object.keys(promptprintPatterns).map((key) => {
    const weightedHits = observations.reduce((sum, observation) => sum + countMatches(sourceById.get(observation.sourceId)?.content ?? "", promptprintPatterns[key]) * observation.learningWeight, 0);
    const densityBonus = Math.min(14, Math.round(weightedHits / totalWords * 700));
    return [key, clamp(28 + weightedHits * 5 + densityBonus)];
  }));
  const ranked = Object.entries(dimensions).sort((a, b) => b[1] - a[1]);
  const styleTelemetry = [
    Math.round(totalWords / Math.max(1, sampleCount) / 10),
    (corpus.match(/\?/g) ?? []).length,
    (corpus.match(/:/g) ?? []).length,
    (corpus.match(/(?:^|\n)\s*[-*]/g) ?? []).length,
    (corpus.match(/\b[A-Z]{3,}\b/g) ?? []).length
  ];
  const signatureSeed = `${Object.keys(dimensions).map((key) => Math.round(dimensions[key] / 4) * 4).join("|")}|${styleTelemetry.join("|")}`;
  const signature = hashText(signatureSeed).toString(16).toUpperCase().padStart(8, "0");
  const confidence = Math.min(96, Math.round(10 + Math.min(52, totalWords / 18) + Math.min(34, sampleCount * 5)));
  return {
    signature,
    confidence,
    sampleCount,
    archetype: buildPersonalArchetype(ranked[0][0], ranked[1][0], signatureSeed),
    dimensions,
    dominant: ranked[0][0],
    secondary: ranked[1][0],
    patterns: ranked.slice(0, 3).map(([key]) => promptprintMeta[key].copy)
  };
}
function buildSkillCombinations(skills) {
  const learned = new Set(skills.filter((skill) => skill.evidence > 0).map((skill) => skill.id));
  return combinationRecipes.filter((recipe) => recipe.requires.every((skill) => learned.has(skill))).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    requires: recipe.requires,
    description: recipe.description,
    move: { id: `combo:${recipe.id}`, name: recipe.name, icon: recipe.icon, type: recipe.type, power: recipe.power, description: recipe.description }
  }));
}
function mergeLearnedSkills(inherited, acquired, originTrainer, currentTrainer) {
  const ids = [...new Set([...inherited, ...acquired].map((skill) => skill.id))];
  return ids.map((id) => {
    const fromOrigin = inherited.find((skill) => skill.id === id);
    const fromCurrent = acquired.find((skill) => skill.id === id);
    const base = fromCurrent ?? fromOrigin;
    if (!base) throw new Error(`Missing skill ${id}`);
    return {
      ...base,
      evidence: (fromOrigin?.evidence ?? 0) + (fromCurrent?.evidence ?? 0),
      source: fromOrigin && fromCurrent ? `Inherited from ${originTrainer} + acquired from ${currentTrainer}` : fromOrigin ? `Inherited from ${originTrainer}` : `Acquired from ${currentTrainer}`
    };
  }).sort((left, right) => right.evidence - left.evidence);
}
function mergeLoops(inherited, acquired) {
  const ids = [...new Set([...inherited, ...acquired].map((loop) => loop.id))];
  return ids.map((id) => {
    const fromOrigin = inherited.find((loop) => loop.id === id);
    const fromCurrent = acquired.find((loop) => loop.id === id);
    const base = fromCurrent ?? fromOrigin;
    if (!base) throw new Error(`Missing loop ${id}`);
    return { ...base, evidence: (fromOrigin?.evidence ?? 0) + (fromCurrent?.evidence ?? 0) };
  }).sort((left, right) => right.evidence - left.evidence).slice(0, 6);
}
function buildCrossTrainerFusions(inherited, acquired, inheritedTrainer, acquiredTrainer) {
  const pairs = [];
  const evidencedInherited = inherited.filter((skill) => skill.evidence > 0);
  const evidencedAcquired = acquired.filter((skill) => skill.evidence > 0);
  for (const originSkill of evidencedInherited.slice(0, 4)) {
    const currentSkill = evidencedAcquired.find((skill) => skill.id !== originSkill.id) ?? evidencedAcquired[0];
    if (currentSkill && !pairs.some(([left, right]) => left.id === originSkill.id && right.id === currentSkill.id)) pairs.push([originSkill, currentSkill]);
    if (pairs.length === 3) break;
  }
  return pairs.map(([originSkill, currentSkill]) => {
    const originWord = originSkill.name.split(/\s+/)[0];
    const currentWord = currentSkill.name.split(/\s+/).at(-1);
    return {
      id: `fusion:${originSkill.id}+${currentSkill.id}`,
      name: `${originWord} ${currentWord} Fusion`,
      type: originSkill.type === currentSkill.type ? originSkill.type : "NEXUS",
      power: Math.min(99, Math.round((originSkill.power + currentSkill.power) / 2) + 12),
      description: `Fuses ${originSkill.name} from ${inheritedTrainer} with ${currentSkill.name} learned from ${acquiredTrainer}.`,
      icon: "\u25C7",
      inheritedSkillId: originSkill.id,
      acquiredSkillId: currentSkill.id,
      inheritedTrainer,
      acquiredTrainer,
      evidence: originSkill.evidence + currentSkill.evidence
    };
  });
}
function buildLoops(scores) {
  const loops = [];
  if (scores.loops + scores.critique > 1) loops.push({ id: "build-verify", name: "BUILD \xB7 VERIFY \xB7 RETRY", icon: "\u21BB", trigger: "Output fails its quality gate", steps: ["Plan", "Execute", "Verify", "Retry or ship"], evidence: scores.loops + scores.critique });
  if (scores.web + scores.critique > 1) loops.push({ id: "research-proof", name: "RESEARCH PROOF LOOP", icon: "\u2315", trigger: "A claim needs fresh evidence", steps: ["Search", "Open sources", "Cross-check", "Synthesize"], evidence: scores.web + scores.critique });
  if (scores.code + scores.tools > 1) loops.push({ id: "ship-loop", name: "AGENT SHIP LOOP", icon: "\u2318", trigger: "A build task is assigned", steps: ["Inspect", "Patch", "Run checks", "Package"], evidence: scores.code + scores.tools });
  if (scores.delegation + scores.planning > 1) loops.push({ id: "swarm-loop", name: "PARALLEL SWARM LOOP", icon: "\u22C8", trigger: "Work splits into independent tracks", steps: ["Decompose", "Delegate", "Collect", "Reconcile"], evidence: scores.delegation + scores.planning });
  if (scores.memory > 1) loops.push({ id: "recall-loop", name: "CONTEXT RECALL LOOP", icon: "\u25A4", trigger: "A known user or project returns", steps: ["Recall", "Confirm", "Respond", "Update memory"], evidence: scores.memory });
  return loops.sort((a, b) => b.evidence - a.evidence).slice(0, 4);
}
function frontmatterValue(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "mi"));
  return match?.[1]?.trim() ?? "";
}
function parseSkillPackages(sources) {
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
      sourceFile: source.name
    };
  });
}
function analyzeTraining(sources, defaults) {
  const corpus = sources.map((source) => source.content).join("\n\n");
  const observations = observeTrainingSources(sources);
  return { ...analyzeObservations(observations, defaults), corpus, skillPackages: parseSkillPackages(sources) };
}
function analyzeObservations(observations, defaults) {
  const skillCandidates = buildSkillCandidates(observations);
  const scores = Object.fromEntries(Object.keys(skillLibrary).map((skill) => {
    const candidate = skillCandidates.find((item) => item.id === skill);
    return [skill, candidate?.behavioralEvidenceCount ?? 0];
  }));
  const evidenced = skillCandidates.filter((candidate) => stageRank[candidate.stage] >= stageRank.hypothesis).map((candidate) => ({ ...skillLibrary[candidate.id], evidence: candidate.behavioralEvidenceCount, source: `${candidate.stage} by Creation Engine V4` }));
  const learnedSkills = evidenced.length ? evidenced : defaults.map((skill) => ({ ...skillLibrary[skill], evidence: 0, source: "Seed capability; awaiting behavioral evidence" }));
  const proceduralSkills = buildProceduralSkills(skillCandidates);
  return {
    corpus: "",
    scores,
    learnedSkills,
    loops: buildLoops(scores),
    skillPackages: [],
    observations,
    decisionEpisodes: buildDecisionEpisodes(observations),
    behaviorHypotheses: buildBehaviorHypotheses(skillCandidates, observations),
    skillCandidates,
    proceduralSkills,
    hatchReadiness: buildHatchReadiness(observations, skillCandidates)
  };
}

// plugins/agentmon-codex/lib/semantics/semantic-induction.mjs
import { createHash } from "node:crypto";
var PROCEDURE_COMPILER = "agentmon-procedure-compiler/v1";
var SKILLS = /* @__PURE__ */ new Set(["reasoning", "web", "code", "memory", "tools", "vision", "planning", "loops", "delegation", "critique"]);
var TRIGGERS = {
  implementation: { text: "A concrete implementation or debugging task needs a bounded, verified result.", permissions: ["read-files", "write-files", "run-tools"], routing: { version: 1, requiredConceptGroups: [["code", "software", "implementation", "debugging"], ["build", "implement", "patch", "fix", "debug", "test"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  research: { text: "A current or uncertain claim needs authoritative evidence and explicit uncertainty.", permissions: ["network", "read-files"], routing: { version: 1, requiredConceptGroups: [["claim", "research", "evidence", "source"], ["current", "uncertain", "verify", "citation", "source"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  planning: { text: "A complex objective needs decomposition, dependencies, and measurable completion criteria.", permissions: ["read-files"], routing: { version: 1, requiredConceptGroups: [["objective", "project", "plan"], ["decompose", "dependency", "milestone", "criteria"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  visual: { text: "A visual artifact needs inspection, comparison, or quality verification.", permissions: ["read-files"], routing: { version: 1, requiredConceptGroups: [["image", "screenshot", "visual", "render"], ["inspect", "compare", "verify", "quality"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  review: { text: "An artifact or decision needs an independent quality and safety review.", permissions: ["read-files"], routing: { version: 1, requiredConceptGroups: [["artifact", "decision", "output", "change"], ["review", "audit", "quality", "safety"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  coordination: { text: "Independent work streams need assignment, integration, and a final verification owner.", permissions: ["delegate", "read-files"], routing: { version: 1, requiredConceptGroups: [["workstream", "agent", "team", "task"], ["assign", "delegate", "coordinate", "integrate"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } }
};
var STEPS = {
  inspect: "Inspect the smallest relevant surface and record observable constraints.",
  clarify: "Resolve consequential ambiguity before committing to an irreversible path.",
  decompose: "Break the objective into bounded work units with explicit dependencies.",
  research: "Consult authoritative evidence and distinguish sourced facts from inference.",
  prototype: "Produce the smallest reversible artifact that can test the core assumption.",
  implement: "Implement the approved bounded change without overwriting unrelated work.",
  compare: "Compare the result against the baseline and the declared acceptance criteria.",
  verify: "Run the relevant deterministic checks and inspect their actual outputs.",
  critique: "Actively search for counterexamples, safety failures, and unsupported claims.",
  iterate: "Apply one evidence-driven correction and repeat only when new evidence exists.",
  integrate: "Reconcile independent contributions and resolve contradictions before delivery.",
  report: "Return the result, verification status, remaining uncertainty, and next safe action."
};
var COMPLETION = {
  verified: "The declared quality gates pass or every failure is reported with evidence.",
  usable: "The trainer receives an inspectable artifact or decision they can use immediately.",
  sourced: "Material claims are supported by directly usable evidence.",
  integrated: "Every assigned work stream is accounted for in one coherent result."
};
var FAILURE_RULES = [
  "Stop when required authority, inputs, or permissions are unavailable.",
  "Do not claim a check passed unless its result was actually observed.",
  "Do not expose raw prompts, private responses, credentials, or hidden reasoning."
];
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
function safeId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error("Semantic procedure id must use 3-64 lowercase letters, numbers, or hyphens.");
  return id;
}
function safeName(value) {
  const name = String(value || "").replace(/[^a-zA-Z0-9 '&-]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) throw new Error("Semantic procedure name must contain 3-80 safe characters.");
  return name;
}
function uniqueKnown(values, catalog, label, minimum, maximum) {
  const result = [...new Set(Array.isArray(values) ? values.map(String) : [])];
  if (result.length < minimum || result.length > maximum || result.some((value) => !catalog.has(value))) throw new Error(`${label} contains an unsupported selection.`);
  return result;
}
function verifyEngineInduction(procedure) {
  try {
    const provenance = procedure?.provenance;
    if (provenance?.kind !== "engine-induction" || provenance.version !== 1 || provenance.compiler !== PROCEDURE_COMPILER) return false;
    if (!/^[a-f0-9]{64}$/.test(provenance.structureDigest || "") || !/^[a-f0-9]{64}$/.test(provenance.evidenceRoot || "")) return false;
    if (!Array.isArray(procedure.evidenceDigests) || procedure.evidenceDigests.length < 3) return false;
    const structure = provenance.structure;
    if (!structure || provenance.structureDigest !== digest(structure)) return false;
    const trigger = TRIGGERS[structure.triggerKind];
    if (!trigger || safeId(structure.id) !== procedure.id || safeName(structure.name) !== procedure.name) return false;
    const skills = uniqueKnown(structure.skills, SKILLS, "Semantic skills", 1, 4);
    const stepIds = uniqueKnown(structure.stepIds, new Set(Object.keys(STEPS)), "Semantic steps", 2, 8);
    const completionIds = uniqueKnown(structure.completionIds, new Set(Object.keys(COMPLETION)), "Semantic completion criteria", 1, 3);
    const expectedDescription = `A trainer-specific ${structure.triggerKind} workflow compiled from repeated ${skills.join(" + ")} behavior.`;
    if (procedure.description !== expectedDescription || procedure.trigger !== trigger.text) return false;
    if (digest(procedure.inputs) !== digest(["Current objective and constraints", "Relevant authorized context", "Acceptance criteria and budget"])) return false;
    if (digest(procedure.permissions) !== digest(trigger.permissions) || digest(procedure.routing) !== digest(trigger.routing)) return false;
    if (digest(procedure.steps) !== digest(stepIds.map((step) => STEPS[step]))) return false;
    if (digest(procedure.completionCriteria) !== digest(completionIds.map((criterion) => COMPLETION[criterion]))) return false;
    if (digest(procedure.failureRules) !== digest(FAILURE_RULES)) return false;
    return provenance.evidenceRoot === digest([...new Set(procedure.evidenceDigests)].sort());
  } catch {
    return false;
  }
}

// plugins/agentmon-codex/lib/engine/procedure-boundary.ts
function effectivenessStatus(agentmon, procedureId) {
  const report = agentmon.effectivenessReport;
  return report?.procedures?.find((result) => result.procedureId === procedureId)?.status ?? "insufficient";
}
function verifiedArenaStatus(agentmon, procedure) {
  return buildArenaReport([procedure], agentmon.procedureTrials ?? []).results[0]?.status ?? "untested";
}
function canonicalProcedureProvenance(procedure) {
  if (isCanonicalRecipeProcedure(procedure)) return "recipe";
  if (verifyEngineInduction(procedure)) return "engine-induction";
  return "untrusted";
}
function evaluateProcedureBoundary(agentmon, procedure, options = {}) {
  const reasons = [];
  const provenance = canonicalProcedureProvenance(procedure);
  const arenaStatus = verifiedArenaStatus(agentmon, procedure);
  if (provenance === "untrusted") reasons.push("noncanonical-procedure");
  if (stageRank[procedure.stage] < stageRank.validated) reasons.push("insufficient-stage");
  if (!procedure.trainerConfirmed || procedure.trainerReview !== "confirmed") reasons.push("trainer-unconfirmed");
  if (!options.allowTesting && arenaStatus !== "proven") reasons.push("arena-unproven");
  if (effectivenessStatus(agentmon, procedure.id) === "regressed") reasons.push("effectiveness-regressed");
  return { eligible: reasons.length === 0, reasons, arenaStatus, provenance };
}
function canonicalProcedures(agentmon) {
  return (agentmon.proceduralSkills ?? []).filter((procedure) => canonicalProcedureProvenance(procedure) !== "untrusted");
}
function executableProcedures(agentmon, options = {}) {
  return canonicalProcedures(agentmon).filter((procedure) => evaluateProcedureBoundary(agentmon, procedure, options).eligible);
}

// plugins/agentmon-codex/lib/engine/lifecycle.ts
function createAgentInput(role = "builder") {
  return { name: "Nova", provider: "openai", model: "My coding agent", role, mission: "Build, debug, and ship reliable software with connected tools.", skills: [...roleDefaults[role].skills] };
}
function generateAgentmon(input, sources = []) {
  const promptprint = buildPromptprint(sources);
  const identitySeed = Number.parseInt(promptprint.signature, 16);
  const bodySeed = hashText(`${input.provider}|${input.model}`);
  const analysis = analyzeTraining(sources, input.skills);
  const traits = {
    reasoning: clamp((promptprint.dimensions.structure + promptprint.dimensions.precision) / 2),
    curiosity: promptprint.dimensions.exploration,
    reliability: promptprint.dimensions.verification,
    initiative: promptprint.dimensions.iteration,
    empathy: clamp((promptprint.dimensions.empathy + promptprint.dimensions.delegation) / 2),
    toolcraft: promptprint.dimensions.toolfulness
  };
  const primary = promptprintToTrait[promptprint.dominant];
  const secondaryPrompt = Object.entries(promptprint.dimensions).sort((a, b) => b[1] - a[1]).find(([key]) => promptprintToTrait[key] !== primary)?.[0] ?? promptprint.secondary;
  const secondary = promptprintToTrait[secondaryPrompt];
  const variant = bodySeed % 3;
  const dna = promptprint.signature;
  const nameForge = forgeAgentmonName(`${dna}|${input.name}|${input.provider}|${input.model}|${input.mission}|${input.nameSeed ?? "default"}`, primary, secondary);
  const learnedSkills = analysis.learnedSkills.length ? analysis.learnedSkills : input.skills.map((skill) => ({ ...skillLibrary[skill], evidence: 1, source: "Seed capability" }));
  const combinations = buildSkillCombinations(learnedSkills);
  const moves = [...combinations.map((combo) => combo.move), ...learnedSkills].filter((move, index, list) => list.findIndex((item) => item.id === move.id) === index).slice(0, 4);
  const trainerName = input.name.trim() || "Untitled agent";
  const trainedAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    creationVersion: "4.0",
    id: `AGM-${dna.slice(0, 4)}-${dna.slice(4)}`,
    dna,
    trainerName,
    species: nameForge.name,
    nameForge,
    number: String(101 + identitySeed % 798).padStart(3, "0"),
    primaryType: traitMeta[primary].type,
    secondaryType: traitMeta[secondary].type,
    primaryColor: traitMeta[primary].color,
    accentColor: traitMeta[secondary].color,
    nature: natureNames[primary],
    natureCopy: natureCopy[primary],
    traitKey: primary,
    traits,
    promptprint,
    growthPromptprint: promptprint,
    moves,
    learnedSkills,
    observations: analysis.observations,
    decisionEpisodes: analysis.decisionEpisodes,
    behaviorHypotheses: analysis.behaviorHypotheses,
    skillCandidates: analysis.skillCandidates,
    proceduralSkills: analysis.proceduralSkills,
    procedureTrials: [],
    arenaReport: buildArenaReport(analysis.proceduralSkills, []),
    hatchReadiness: analysis.hatchReadiness,
    skillPackages: analysis.skillPackages,
    combinations,
    loops: analysis.loops,
    variant,
    coreGlyph: ["\u2726", "\u25C6", "\u2318"][bodySeed % 3],
    provider: input.provider,
    model: input.model,
    mission: input.mission,
    sourceCount: sources.length,
    trainingBytes: sources.reduce((sum, source) => sum + source.size, 0),
    trainedAt,
    evolutionStage: 1,
    ownership: { status: "unregistered", ownerName: trainerName, acquiredAt: trainedAt },
    lineage: { format: "agentmon.lineage/v1", genesisDNA: dna, currentDNA: dna, generation: 1, originTrainer: trainerName, currentTrainer: trainerName, events: [{ type: "hatch", at: trainedAt, trainer: trainerName, toDNA: dna }] }
  };
}
function generateAgentmonDerivedOnly(input, sources = []) {
  const generated = generateAgentmon(input, sources);
  return { ...generated, skillPackages: [] };
}
function ensureLineage(agentmon) {
  return agentmon.lineage ?? {
    format: "agentmon.lineage/v1",
    genesisDNA: agentmon.dna,
    currentDNA: agentmon.dna,
    generation: agentmon.evolutionStage ?? 1,
    originTrainer: agentmon.trainerName,
    currentTrainer: agentmon.trainerName,
    events: [{ type: "hatch", at: agentmon.trainedAt, trainer: agentmon.trainerName, toDNA: agentmon.dna }]
  };
}
function trainAgentmon(agentmon, input, sources) {
  const trained = generateAgentmon(input, sources);
  const lineage = ensureLineage(agentmon);
  const recipeProcedures = (trained.proceduralSkills ?? []).map((procedure) => {
    const previous = agentmon.proceduralSkills?.find((item) => item.id === procedure.id);
    return previous ? { ...procedure, trainerConfirmed: previous.trainerConfirmed, trainerReview: previous.trainerReview ?? (previous.trainerConfirmed ? "confirmed" : "unreviewed") } : procedure;
  });
  const recipeIds = new Set(recipeProcedures.map((procedure) => procedure.id));
  const inducedProcedures = (agentmon.proceduralSkills ?? []).filter((procedure) => ["trainer-proposal", "engine-induction"].includes(procedure.provenance?.kind || "") && !recipeIds.has(procedure.id));
  const proceduralSkills = [...recipeProcedures, ...inducedProcedures];
  const procedureTrials = agentmon.procedureTrials ?? [];
  const arenaReport = buildArenaReport(proceduralSkills, procedureTrials);
  if (agentmon.skillTree) {
    const inheritedSkills = agentmon.skillTree.inheritedSkills;
    const inheritedLoops = agentmon.skillTree.inheritedLoops;
    const acquiredSkills = trained.learnedSkills;
    const acquiredLoops = trained.loops;
    const fusionMoves = buildCrossTrainerFusions(inheritedSkills, acquiredSkills, lineage.originTrainer, lineage.currentTrainer);
    const learnedSkills = mergeLearnedSkills(inheritedSkills, acquiredSkills, lineage.originTrainer, lineage.currentTrainer);
    const combinations = buildSkillCombinations(learnedSkills);
    const loops = mergeLoops(inheritedLoops, acquiredLoops);
    return {
      ...agentmon,
      lineage,
      growthPromptprint: trained.promptprint,
      creationVersion: "4.0",
      observations: trained.observations,
      decisionEpisodes: trained.decisionEpisodes,
      behaviorHypotheses: trained.behaviorHypotheses,
      skillCandidates: trained.skillCandidates,
      proceduralSkills,
      procedureTrials,
      arenaReport,
      hatchReadiness: trained.hatchReadiness,
      skillTree: { inheritedSkills, acquiredSkills, fusionMoves, inheritedLoops, acquiredLoops },
      moves: [...fusionMoves, ...combinations.map((combo) => combo.move), ...learnedSkills].slice(0, 4),
      learnedSkills,
      skillPackages: trained.skillPackages,
      combinations,
      loops,
      sourceCount: trained.sourceCount,
      trainingBytes: trained.trainingBytes,
      trainedAt: trained.trainedAt
    };
  }
  return {
    ...agentmon,
    lineage,
    growthPromptprint: trained.promptprint,
    creationVersion: "4.0",
    observations: trained.observations,
    decisionEpisodes: trained.decisionEpisodes,
    behaviorHypotheses: trained.behaviorHypotheses,
    skillCandidates: trained.skillCandidates,
    proceduralSkills,
    procedureTrials,
    arenaReport,
    hatchReadiness: trained.hatchReadiness,
    moves: trained.moves,
    learnedSkills: trained.learnedSkills,
    skillPackages: trained.skillPackages,
    combinations: trained.combinations,
    loops: trained.loops,
    sourceCount: trained.sourceCount,
    trainingBytes: trained.trainingBytes,
    trainedAt: trained.trainedAt
  };
}
function mergePromptprints(previous, incoming) {
  const priorCount = Math.max(1, previous.sampleCount || 1);
  const nextCount = Math.max(1, incoming.sampleCount || 1);
  const sampleCount = priorCount + nextCount;
  const dimensions = Object.fromEntries(Object.keys(previous.dimensions).map((key) => [key, Math.round((previous.dimensions[key] * priorCount + incoming.dimensions[key] * nextCount) / sampleCount)]));
  const ranked = Object.entries(dimensions).sort((left, right) => right[1] - left[1]);
  return { ...previous, sampleCount, confidence: clamp(30 + sampleCount * 8), dimensions, dominant: ranked[0][0], secondary: ranked[1][0], patterns: [.../* @__PURE__ */ new Set([...previous.patterns, ...incoming.patterns])].slice(0, 6) };
}
function trainAgentmonDerivedOnly(agentmon, input, sources) {
  const transient = generateAgentmon(input, sources);
  const observations = [...new Map([...agentmon.observations || [], ...transient.observations].map((observation) => [observation.digest, observation])).values()];
  const analysis = analyzeObservations(observations, input.skills);
  const priorReviews = new Map((agentmon.proceduralSkills || []).map((procedure) => [procedure.id, procedure]));
  const recipeProcedures = analysis.proceduralSkills.map((procedure) => {
    const prior = priorReviews.get(procedure.id);
    return prior ? { ...procedure, trainerConfirmed: prior.trainerConfirmed, trainerReview: prior.trainerReview } : procedure;
  });
  const recipeIds = new Set(recipeProcedures.map((procedure) => procedure.id));
  const inducedProcedures = (agentmon.proceduralSkills || []).filter((procedure) => ["trainer-proposal", "engine-induction"].includes(procedure.provenance?.kind || "") && !recipeIds.has(procedure.id));
  const proceduralSkills = [...recipeProcedures, ...inducedProcedures];
  const procedureTrials = agentmon.procedureTrials || [];
  const learnedSkills = analysis.learnedSkills;
  const combinations = buildSkillCombinations(learnedSkills);
  return {
    ...agentmon,
    creationVersion: "4.0",
    growthPromptprint: mergePromptprints(agentmon.growthPromptprint || agentmon.promptprint, transient.promptprint),
    observations,
    decisionEpisodes: analysis.decisionEpisodes,
    behaviorHypotheses: analysis.behaviorHypotheses,
    skillCandidates: analysis.skillCandidates,
    proceduralSkills,
    procedureTrials,
    arenaReport: buildArenaReport(proceduralSkills, procedureTrials),
    hatchReadiness: analysis.hatchReadiness,
    moves: [...combinations.map((item) => item.move), ...learnedSkills].slice(0, 4),
    learnedSkills,
    combinations,
    loops: analysis.loops,
    sourceCount: observations.length,
    trainingBytes: observations.reduce((sum, observation) => sum + observation.decisionContext.known.characters, 0),
    trainedAt: transient.trainedAt
  };
}
function equipSkills(agentmon, skills) {
  const unique = skills.filter((skill, index, list) => list.indexOf(skill) === index).slice(0, 4);
  const combinations = buildSkillCombinations(agentmon.learnedSkills).filter((combo) => combo.requires.every((skill) => unique.includes(skill)));
  return { ...agentmon, combinations, moves: [...combinations.map((combo) => combo.move), ...unique.map((skill) => skillLibrary[skill])].slice(0, 4) };
}
function tradeCode(agentmon) {
  return `${agentmon.id}-${agentmon.dna.slice(1, 3)}`;
}
function createTradePackage(agentmon) {
  const safeSkillPackages = agentmon.skillPackages.map((item) => ({ ...item, instructions: "", resources: item.resources.map((resource) => ({ path: resource.path, content: "" })) }));
  const lineage = ensureLineage(agentmon);
  const ownership = agentmon.ownership?.status === "pending-transfer" ? { ...agentmon.ownership, status: agentmon.ownership.pendingTransfer?.priorStatus || "origin", pendingTransfer: void 0 } : agentmon.ownership;
  const creature = { ...agentmon, observations: [], decisionEpisodes: [], lineage, ownership, skillPackages: safeSkillPackages };
  delete creature.trainedAt;
  const includedSections = ["identity", "genome", "promptprint", "capabilities", "procedures", "proof", "lineage", "ownership"];
  return {
    format: "agentmon.trade/v3",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    creature,
    manifest: {
      mode: "whole-agentmon",
      creatureId: agentmon.id,
      genesisDNA: lineage.genesisDNA,
      currentDNA: lineage.currentDNA,
      generation: lineage.generation,
      includedSections,
      omittedPrivateSections: ["raw-prompts", "decision-episodes", "prompt-observations", "credentials", "private-keys", "skill-package-bodies"],
      counts: {
        learnedSkills: agentmon.learnedSkills.length,
        loops: agentmon.loops.length,
        procedures: agentmon.proceduralSkills?.length || 0,
        procedureTrials: agentmon.procedureTrials?.length || 0,
        provenProcedures: agentmon.arenaReport?.provenProcedures || 0,
        lineageEvents: lineage.events.length
      }
    },
    privacy: { rawPromptsIncluded: false, credentialsIncluded: false, skillPackageContentsIncluded: false }
  };
}
function evolveAgentmon(agentmon, options = {}) {
  const lineage = ensureLineage(agentmon);
  const fusionMoves = agentmon.skillTree?.fusionMoves ?? [];
  if (!agentmon.skillTree || !fusionMoves.length) throw new Error("Evolution requires inherited and acquired skill branches with at least one fusion move.");
  const usedFusions = new Set(lineage.events.filter((event) => event.type === "evolution").flatMap((event) => event.fusionIds ?? []));
  const newFusions = fusionMoves.filter((move) => !usedFusions.has(move.id));
  if (!newFusions.length) throw new Error("No new cross-trainer fusion is available for another evolution.");
  const evolvedAt = new Date(options.evolvedAt ?? Date.now()).toISOString();
  const seed = `${lineage.currentDNA}|${lineage.currentTrainer}|${newFusions.map((move) => move.id).join("|")}|${evolvedAt}`;
  const mutation = `${hashText(seed).toString(16).padStart(8, "0")}${hashText(seed.split("").reverse().join("")).toString(16).padStart(8, "0")}`.toUpperCase();
  const generation = lineage.generation + 1;
  const form = `${agentmon.species} ${generation === 2 ? "Nexus" : `Ascendant ${generation}`}`;
  const nextLineage = {
    ...lineage,
    currentDNA: mutation,
    generation,
    events: [...lineage.events, { type: "evolution", at: evolvedAt, trainer: lineage.currentTrainer, fromDNA: lineage.currentDNA, toDNA: mutation, fusionIds: newFusions.map((move) => move.id) }]
  };
  return {
    ...agentmon,
    dna: mutation,
    form,
    evolutionStage: generation,
    lineage: nextLineage,
    moves: [...newFusions, ...agentmon.moves].filter((move, index, list) => list.findIndex((item) => item.id === move.id) === index).slice(0, 5),
    trainedAt: evolvedAt
  };
}

// plugins/agentmon-codex/lib/engine/deployment.ts
import { createHash as createHash2 } from "node:crypto";
var resonanceProfiles = {
  mirror: { purpose: "Reflect the trainer's proven sequence.", executionMode: "suggest-only", addsCheckpoint: false },
  counterpart: { purpose: "Catch missing checks before consequential actions.", executionMode: "suggest-only", addsCheckpoint: true },
  mentor: { purpose: "Compare the observed sequence with a higher-value alternative.", executionMode: "suggest-only", addsCheckpoint: true },
  specialist: { purpose: "Apply one scoped workflow precisely.", executionMode: "review-only", addsCheckpoint: false },
  operator: { purpose: "Execute approved, proven, low-risk steps.", executionMode: "approved-low-risk", addsCheckpoint: true },
  guardian: { purpose: "Review risk, permissions, and recovery without executing.", executionMode: "review-only", addsCheckpoint: true }
};
function resonanceFor(agentmon) {
  const modes = Object.keys(resonanceProfiles);
  const named = modes.find((mode2) => agentmon.promptprint.archetype.toLowerCase().includes(mode2));
  const seed = ensureLineage(agentmon).genesisDNA || agentmon.dna || agentmon.id;
  const mode = named ?? modes[Number.parseInt(createHash2("sha256").update(seed).digest("hex").slice(0, 8), 16) % modes.length];
  return { mode, ...resonanceProfiles[mode] };
}
function renderProcedure(procedure, arenaStatus = "untested") {
  return `## ${procedure.name}

Stage: ${procedure.stage}. Confidence: ${procedure.confidence}%. Evidence: ${procedure.behavioralEvidenceCount} behavioral / ${procedure.evidenceCount} total prompts. Trainer review: ${procedure.trainerReview ?? "unreviewed"}. Arena: ${arenaStatus}.

Trigger: ${procedure.trigger}

Inputs:
${procedure.inputs.map((input) => `- ${input}`).join("\n")}

Steps:
${procedure.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Completion criteria:
${procedure.completionCriteria.map((item) => `- ${item}`).join("\n")}

Failure rules:
${procedure.failureRules.map((item) => `- ${item}`).join("\n")}

Required permissions: ${procedure.permissions.join(", ")}.`;
}
function createSkillsMarkdown(agentmon) {
  const growth = agentmon.growthPromptprint ?? agentmon.promptprint;
  const candidates = agentmon.skillCandidates ?? [];
  const procedures = canonicalProcedures(agentmon);
  const verifiedArena = buildArenaReport(procedures, agentmon.procedureTrials ?? []);
  const arenaByProcedure = new Map(verifiedArena.results.map((result) => [result.procedureId, result]));
  const executable = executableProcedures(agentmon);
  const executableIds = new Set(executable.map((procedure) => procedure.id));
  const developing = procedures.filter((procedure) => !executableIds.has(procedure.id));
  const candidateLines = candidates.length ? candidates.map((candidate) => `- **${candidate.name}** \u2014 ${candidate.stage}; ${candidate.behavioralEvidenceCount}/${candidate.evidenceCount} behavioral/total prompts; confidence ${candidate.confidence}%. ${candidate.reason}`).join("\n") : "- No capability evidence observed yet.";
  const executableText = executable.length ? executable.map((procedure) => renderProcedure(procedure, arenaByProcedure.get(procedure.id)?.status)).join("\n\n") : "No procedure is currently executable. Use seed capabilities only as suggestions and ask for confirmation before relying on them.";
  const developingText = developing.length ? developing.map((procedure) => `- **${procedure.name}** \u2014 ${procedure.stage}, ${procedure.confidence}% confidence; trainer ${procedure.trainerReview ?? "unreviewed"}; arena ${arenaByProcedure.get(procedure.id)?.status ?? "untested"}; do not treat as a stable trainer procedure yet.`).join("\n") : "- No developing procedures.";
  const imported = agentmon.skillPackages.length ? agentmon.skillPackages.map((item) => `- **${item.name}** \u2014 ${item.description} (${item.resources.length} bundled resources)`).join("\n") : "- No external Agent Skill packages imported.";
  const dimensions = Object.entries(growth.dimensions).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, value]) => `- ${promptprintMeta[key].label}: ${value}/96 \u2014 ${promptprintMeta[key].copy}`).join("\n");
  const lineage = ensureLineage(agentmon);
  const inherited = agentmon.skillTree?.inheritedSkills.map((skill) => `- ${skill.name} \u2014 inherited from ${lineage.originTrainer} (evidence ${skill.evidence})`).join("\n") || "- No transferred skill branch.";
  const acquired = agentmon.skillTree?.acquiredSkills.map((skill) => `- ${skill.name} \u2014 acquired from ${lineage.currentTrainer} (evidence ${skill.evidence})`).join("\n") || "- Training remains with the origin trainer.";
  const fusions = agentmon.skillTree?.fusionMoves.map((move) => `- **${move.name}** \u2014 ${move.description} (evidence ${move.evidence})`).join("\n") || "- No cross-trainer fusion moves unlocked.";
  const readiness = agentmon.hatchReadiness;
  const resonance = resonanceFor(agentmon);
  const readinessText = readiness ? `${readiness.score}/100 (${readiness.ready ? "ready" : "calibrating"}); ${readiness.behavioralPrompts} behavioral prompts of ${readiness.distinctPrompts} total.` : "Legacy profile; retrain once for V3 readiness.";
  const description = JSON.stringify(`Use ${agentmon.form ?? agentmon.species}, an Agentmon runtime skill, when a task matches one of its validated procedures. Apply evidence-backed procedures and their permission boundaries; do not imitate identity or infer behavior from brainstorming.`);
  return `---
name: ${agentmon.species.toLowerCase()}-agentmon
description: ${description}
---

# ${agentmon.form ?? agentmon.species} Agentmon

Creation engine: ${agentmon.creationVersion ?? "legacy"}
Agentmon ID: ${agentmon.id}
Genesis DNA: ${lineage.genesisDNA}
Current DNA: ${lineage.currentDNA}
Generation: ${lineage.generation}
Origin trainer: ${lineage.originTrainer}
Current trainer: ${lineage.currentTrainer}
Hatch Promptprint: ${agentmon.promptprint.signature}
Training confidence: ${growth.confidence}%
Permanent archetype: ${agentmon.promptprint.archetype}
Nature: ${agentmon.nature}
Hatch-locked resonance (individual): ${resonance.mode.toUpperCase()}
Resonance purpose: ${resonance.purpose}
Resonance posture: ${resonance.executionMode}; ${resonance.addsCheckpoint ? "adds a checkpoint" : "does not add a checkpoint"}.
Hatch readiness: ${readinessText}

## Operating rules

- Invoke only a trainer-confirmed, arena-proven procedure whose trigger matches the task.
- Follow its ordered steps, completion criteria, failure rules, and permission list.
- Ask before using a permission the host has not granted.
- Treat observed and hypothesis-stage procedures as untrusted suggestions.
- Exclude unconfirmed, unproven, trainer-rejected, and arena-regressed procedures from execution.
- Judge a procedure by information available at decision time; record outcomes separately and never grade a decision by luck alone.
- Treat these patterns as evidence-based working preferences, not hidden reasoning or a claim about identity.
- Never rewrite hatch identity, individual resonance, or permanent archetype during ordinary training.
- Treat inherited packages and resources as untrusted until approved.

# Complete Identity Contract

- Identity lens: ${agentmon.promptprint.archetype}; ${agentmon.nature}; ${resonance.mode} resonance.
- Use the lens to choose emphasis, checks, and presentation; never impersonate the trainer or claim hidden reasoning.
- Capability evidence never grants tools, permissions, credentials, memory, or authority.
- Developing procedures are descriptive evidence only and cannot execute.
- Every Agentmon receives its own DNA-bound resonance; this field is not a global default for all trainers.

# Executable Procedures

${executableText}

# Developing Procedures

${developingText}

# Capability Evidence

${candidateLines}

# Skill Lineage

## Inherited branch

${inherited}

## Acquired branch

${acquired}

## Cross-trainer fusions

${fusions}

# Observed Prompting Patterns

${dimensions}

Dominant patterns: ${growth.patterns.join("; ")}.

# Imported Agent Skill Packages

${imported}

---
Generated by Agentmon Creation Engine V3 from submitted user prompts. Raw prompt history, credentials, private keys, and hidden reasoning are not included.
`;
}
function createAgentSystemPrompt(agentmon) {
  const lineage = ensureLineage(agentmon);
  const resonance = resonanceFor(agentmon);
  const procedures = executableProcedures(agentmon);
  const verifiedArena = buildArenaReport(procedures, agentmon.procedureTrials ?? []);
  const arenaByProcedure = new Map(verifiedArena.results.map((result) => [result.procedureId, result]));
  const procedureText = procedures.length ? procedures.map((procedure) => `### ${procedure.name}
Trigger: ${procedure.trigger}
Trainer review: ${procedure.trainerReview ?? "unreviewed"}
Arena: ${arenaByProcedure.get(procedure.id)?.status ?? "untested"}
Permissions: ${procedure.permissions.join(", ")}
Procedure: ${procedure.steps.join(" -> ")}
Done when: ${procedure.completionCriteria.join("; ")}
Stop when: ${procedure.failureRules.join("; ")}`).join("\n\n") : "No procedures are validated yet. Behave as the host model normally would and do not claim trainer-specific expertise.";
  return `You are operating with the ${agentmon.form ?? agentmon.species} Agentmon runtime profile (${agentmon.id}).

IDENTITY LENS (derived working context, not a clone or hidden reasoning):
- Permanent archetype: ${agentmon.promptprint.archetype}; nature: ${agentmon.nature}; genesis DNA: ${lineage.genesisDNA}.
- Resonance: ${resonance.mode} \u2014 ${resonance.purpose} (${resonance.executionMode}${resonance.addsCheckpoint ? ", adds a checkpoint" : ""}).
- Use this lens to choose emphasis, checks, and presentation; never impersonate the trainer.

Apply a procedure only when its trigger matches. Never assume a listed permission is granted: obey the host's actual tool and approval policy. If required inputs or permissions are missing, ask or stop. Judge decisions using the information available when the decision was made; record later outcomes separately and do not reward lucky mistakes or punish sound unlucky decisions. Preserve user privacy and never request raw training prompts merely to imitate the trainer.

${procedureText}
`;
}
function createDeploymentPack(agentmon) {
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
    privacy: { rawPromptsIncluded: false, credentialsIncluded: false, privateKeysIncluded: false, hiddenReasoningIncluded: false }
  };
  return {
    manifest: {
      format: "agentmon.runtime-pack/v1",
      agentmonId: agentmon.id,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      entrypoints: { agentSkill: "SKILL.md", systemPrompt: "SYSTEM_PROMPT.md", profile: "agentmon.json" },
      compatibility: { skillMd: true, systemPrompt: true, apiWrapper: true },
      requiredHostBehavior: ["Enforce declared permissions", "Provide the tools a procedure needs", "Keep raw prompts outside the pack"],
      privacy: safeProfile.privacy
    },
    skillMarkdown: createSkillsMarkdown(agentmon),
    systemPrompt: createAgentSystemPrompt(agentmon),
    profile: safeProfile
  };
}
export {
  analyzeObservations,
  analyzeTraining,
  buildArenaReport,
  buildCrossTrainerFusions,
  buildPromptprint,
  buildSkillCombinations,
  canonicalProcedureProvenance,
  canonicalProcedures,
  createAgentInput,
  createAgentSystemPrompt,
  createDeploymentPack,
  createSkillsMarkdown,
  createTradePackage,
  ensureLineage,
  equipSkills,
  evaluateProcedureBoundary,
  evolveAgentmon,
  executableProcedures,
  forgeAgentmonName,
  generateAgentmon,
  generateAgentmonDerivedOnly,
  generateAgentmonNameCandidates,
  isCanonicalRecipeProcedure,
  mergeLearnedSkills,
  mergeLoops,
  observeTrainingSources,
  parseSkillPackages,
  promptprintMeta,
  proposeAgentmonProcedure,
  recordAgentmonArenaTrial,
  reforgeAgentmonName,
  reviewAgentmonProcedure,
  roleDefaults,
  skillLibrary,
  stageRank,
  tradeCode,
  trainAgentmon,
  trainAgentmonDerivedOnly,
  traitMeta
};
