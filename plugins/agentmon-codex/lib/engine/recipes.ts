import type { ProceduralSkill, PromptprintKey, SkillCombination, SkillKey, TraitKey } from "./types";

export const natureNames: Record<TraitKey, string> = { reasoning: "METHODICAL", curiosity: "INQUISITIVE", reliability: "STEADFAST", initiative: "BOLD", empathy: "ATTENTIVE", toolcraft: "RESOURCEFUL" };
export const natureCopy: Record<TraitKey, string> = { reasoning: "Maps the whole problem before making a move.", curiosity: "Investigates every strange path it finds.", reliability: "Protects the team with consistent answers.", initiative: "Leaps into action before the field settles.", empathy: "Reads its trainer and adapts with care.", toolcraft: "Collects useful tools and combines them creatively." };

export const skillPatterns: Record<SkillKey, RegExp> = {
  reasoning: /reason|analy[sz]|step[- ]by[- ]step|deduc|compare|tradeoff|think through/gi,
  web: /search|browse|source|citation|research|url|https?:\/\//gi,
  code: /\bbuild\b|code|debug|implement|patch|function|class |typescript|javascript|python|sql|npm |git |compile|tests?|test suite/gi,
  memory: /remember|memory|context|history|preference|recall|knowledge base/gi,
  tools: /\btools?\b|tool call|function call|api |mcp|connector|terminal|execute|integration/gi,
  vision: /image|visual|screenshot|camera|diagram|pixel|render/gi,
  planning: /plan|todo|milestone|roadmap|next step|first.+then|step [0-9]/gi,
  loops: /loop|iterate|retry|until|repeat|monitor|poll|reflect|recurring/gi,
  delegation: /delegate|subagent|parallel|handoff|worker|swarm|team of agents/gi,
  critique: /verify|review|validate|double-check|critique|audit|quality check|fact-check/gi,
};

export const promptprintPatterns: Record<PromptprintKey, RegExp> = {
  structure: /(^|\n)\s*(?:[-*]|\d+[.)])\s|plan|outline|section|step|workflow|first.+then/gi,
  precision: /exact|specific|must|constraint|format|schema|strict|only|do not|require|verbatim/gi,
  exploration: /alternative|option|explore|brainstorm|possib|what if|compare|idea|different approach/gi,
  iteration: /iterate|retry|refine|improve|revise|again|feedback|version|polish|keep working/gi,
  verification: /verify|validate|test|check|source|citation|evidence|audit|confirm|fact/gi,
  delegation: /delegate|subagent|parallel|handoff|assign|team|worker|split the work|collaborat/gi,
  toolfulness: /tool|api|mcp|browser|terminal|file|connector|execute|run |upload|download/gi,
  empathy: /user|audience|tone|clear|friendly|helpful|accessible|feel|people|understand/gi,
};

export const archetypeVoices: Record<PromptprintKey, string[]> = {
  structure: ["SYSTEM", "PATTERN", "QUEST", "BLUEPRINT"],
  precision: ["EXACT", "BOUNDARY", "SIGNAL", "DETAIL"],
  exploration: ["FRONTIER", "WONDER", "POSSIBILITY", "WILDPATH"],
  iteration: ["RECURSIVE", "RELENTLESS", "VERSION", "REFINING"],
  verification: ["PROOF", "EVIDENCE", "TRUTH", "CHECKPOINT"],
  delegation: ["SWARM", "SQUAD", "CHORUS", "TEAM"],
  toolfulness: ["GEAR", "TOOLCHAIN", "INTERFACE", "MAKER"],
  empathy: ["HUMAN", "INTENT", "KINSHIP", "AUDIENCE"],
};

export const archetypeForms: Record<PromptprintKey, string[]> = {
  structure: ["ARCHITECT", "CARTOGRAPHER", "WEAVER", "BUILDER"],
  precision: ["CRAFTER", "CALIBRATOR", "WARDEN", "SMITH"],
  exploration: ["PATHFINDER", "SCOUT", "SEEKER", "DREAMER"],
  iteration: ["LOOPSMITH", "REFINER", "RUNNER", "FORGER"],
  verification: ["PROVER", "AUDITOR", "KEEPER", "SENTINEL"],
  delegation: ["CONDUCTOR", "CALLER", "MARSHAL", "LINKER"],
  toolfulness: ["GEARSMITH", "TAMER", "BINDER", "ENGINEER"],
  empathy: ["TRANSLATOR", "LISTENER", "GUIDE", "ALLY"],
};

export const promptprintToTrait: Record<PromptprintKey, TraitKey> = {
  structure: "reasoning", precision: "reliability", exploration: "curiosity", iteration: "initiative", verification: "reliability", delegation: "empathy", toolfulness: "toolcraft", empathy: "empathy",
};

export const combinationRecipes: Array<Omit<SkillCombination, "move"> & { type: string; power: number }> = [
  { id: "evidence-hunt", name: "Evidence Hunt", icon: "⌕✓", requires: ["web", "critique"], description: "Searches broadly, then attacks only with verified evidence.", type: "LOGIC", power: 86 },
  { id: "swarm-command", name: "Swarm Command", icon: "⋈⌖", requires: ["planning", "delegation"], description: "Decomposes a quest and coordinates parallel helpers.", type: "HEART", power: 88 },
  { id: "toolchain-burst", name: "Toolchain Burst", icon: "⌘</>", requires: ["code", "tools"], description: "Chains code execution with the right connected tools.", type: "GEAR", power: 92 },
  { id: "recursive-refine", name: "Recursive Refine", icon: "↻✓", requires: ["loops", "critique"], description: "Repeats work, checks the result, and exits only when it passes.", type: "GUARD", power: 90 },
  { id: "context-weave", name: "Context Weave", icon: "▤◆", requires: ["memory", "reasoning"], description: "Combines stored context with careful reasoning.", type: "LOGIC", power: 81 },
  { id: "field-scan", name: "Field Scan", icon: "◉⌕", requires: ["vision", "web"], description: "Reads the visible field and investigates what it finds.", type: "SPARK", power: 84 },
];

export type ProcedureRecipe = Omit<ProceduralSkill, "stage" | "confidence" | "evidenceCount" | "behavioralEvidenceCount" | "evidenceDigests" | "trainerConfirmed"> & { requires: SkillKey[] };

export const procedureRecipes: ProcedureRecipe[] = [
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
    permissions: ["read-files", "write-files", "run-tools"],
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
    permissions: ["read-files", "write-files", "run-tools"],
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
    permissions: ["network", "read-files"],
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
    permissions: ["read-files", "write-files", "run-tools"],
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
    permissions: ["delegate", "read-files", "write-files"],
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
    permissions: ["memory", "read-files"],
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
    permissions: ["read-files", "network"],
  },
];
