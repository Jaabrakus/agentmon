export type TraitKey = "reasoning" | "curiosity" | "reliability" | "initiative" | "empathy" | "toolcraft";
export type PromptprintKey = "structure" | "precision" | "exploration" | "iteration" | "verification" | "delegation" | "toolfulness" | "empathy";
export type RoleKey = "builder" | "researcher" | "operator" | "companion";
export type ProviderKey = "openai" | "anthropic" | "google" | "local" | "custom";
export type SkillKey = "reasoning" | "web" | "code" | "memory" | "tools" | "vision" | "planning" | "loops" | "delegation" | "critique";
export type PromptIntent = "personal-preference" | "directive" | "product-spec" | "brainstorm" | "question" | "reference";
export type SkillStage = "observed" | "hypothesis" | "validated" | "learned";
export type AgentPermission = "read-files" | "write-files" | "run-tools" | "network" | "delegate" | "memory";
export type ProcedureReview = "unreviewed" | "confirmed" | "rejected";
export type ArenaVariant = "baseline" | "agentmon";
export type DecisionQuality = "pass" | "fail";
export type ObservedOutcome = "success" | "failure" | "unknown";

export type AgentInput = {
  name: string;
  provider: ProviderKey;
  model: string;
  role: RoleKey;
  mission: string;
  skills: SkillKey[];
  nameSeed?: string;
};

export type NameForgeProfile = {
  format: "agentmon.nameforge/v1";
  generatorVersion: "1.0";
  name: string;
  seedDigest: string;
  soundPacks: string[];
  templates: string[];
  syllables: string[];
  asciiSkeleton: string;
  moderation: "unreviewed" | "approved" | "blocked";
};

export type TrainingSource = {
  id: string;
  name: string;
  kind: "prompt" | "history" | "skills" | "json" | "resource";
  content: string;
  size: number;
  intentOverride?: PromptIntent;
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

export type PromptObservation = {
  sourceId: string;
  digest: string;
  intent: PromptIntent;
  engineIntent: PromptIntent;
  classificationSource: "engine" | "trainer";
  confidence: number;
  learningWeight: number;
  signals: SkillKey[];
  decisionContext: {
    known: { sourceKind: TrainingSource["kind"]; characters: number; hasQuestionMark: boolean; imperativeStart: boolean; signals: SkillKey[] };
    unknown: string[];
    estimates: { intent: PromptIntent; confidence: number; learningWeight: number };
  };
};

export type DecisionEpisode = {
  id: string;
  sourceId: string;
  digest: string;
  context: PromptObservation["decisionContext"];
  prediction: { intent: PromptIntent; engineIntent: PromptIntent; confidence: number };
  resolution: { status: "unreviewed" | "trainer-corrected"; correctedIntent?: PromptIntent };
};

export type BehaviorHypothesis = {
  id: SkillKey;
  hypothesis: string;
  confidence: number;
  status: "open" | "strengthened" | "weakened" | "confirmed" | "rejected";
  evidenceFor: string[];
  evidenceAgainst: string[];
  neutralContext: string[];
  guardrail: string;
};

export type ProcedureTrial = {
  id: string;
  procedureId: string;
  variant: ArenaVariant;
  decisionQuality: DecisionQuality;
  outcome: ObservedOutcome;
  recordedAt: string;
  source?: "manual" | "automatic";
  runId?: string;
};

export type ProcedureArenaResult = {
  procedureId: string;
  baseline: { trials: number; passes: number; passRate: number; lowerBound: number };
  agentmon: { trials: number; passes: number; passRate: number; lowerBound: number };
  lift: number;
  outcomeAgreement: number | null;
  status: "untested" | "testing" | "proven" | "regressed";
};

export type AgentmonArenaReport = {
  format: "agentmon.arena/v1";
  results: ProcedureArenaResult[];
  provenProcedures: number;
  testedProcedures: number;
};

export type SkillCandidate = {
  id: SkillKey;
  name: string;
  stage: SkillStage;
  confidence: number;
  evidenceCount: number;
  behavioralEvidenceCount: number;
  weightedEvidence: number;
  sourceDigests: string[];
  positiveIntents: PromptIntent[];
  reason: string;
};

export type ProceduralSkill = {
  id: string;
  name: string;
  description: string;
  stage: SkillStage;
  confidence: number;
  evidenceCount: number;
  behavioralEvidenceCount: number;
  trigger: string;
  routing?: ProcedureRoutingPolicy;
  inputs: string[];
  steps: string[];
  completionCriteria: string[];
  failureRules: string[];
  permissions: AgentPermission[];
  evidenceDigests: string[];
  trainerConfirmed: boolean;
  trainerReview?: ProcedureReview;
  provenance?: {
    kind: "recipe" | "trainer-proposal" | "engine-induction";
    version: number;
    createdAt?: string;
    compiler?: string;
    structure?: Record<string, unknown>;
    structureDigest?: string;
    evidenceRoot?: string;
    proposer?: { mode: "shadow" | "deterministic"; modelDigest?: string };
    rawPromptsIncluded?: false;
  };
};

export type ProcedureRoutingPolicy = {
  version: 1;
  requiredConceptGroups: string[][];
  excludedConcepts: string[];
  minimumMatchedConcepts: number;
  minimumRelevance: number;
};

export type ProcedureProposal = {
  format: "agentmon.procedure-proposal/v1";
  id: string;
  name: string;
  description: string;
  trigger: string;
  routing?: ProcedureRoutingPolicy;
  inputs: string[];
  steps: string[];
  completionCriteria: string[];
  failureRules: string[];
  permissions: AgentPermission[];
};

export type HatchReadiness = {
  ready: boolean;
  score: number;
  reasons: string[];
  distinctPrompts: number;
  behavioralPrompts: number;
  intentDiversity: number;
};

export type FusionMove = Move & {
  inheritedSkillId: string;
  acquiredSkillId: string;
  inheritedTrainer: string;
  acquiredTrainer: string;
  evidence: number;
};

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

export type AgentmonLineageEvent = {
  type: "hatch" | "transfer" | "evolution";
  at: string;
  trainer: string;
  fromDNA?: string;
  toDNA: string;
  fromTrainer?: string;
  fusionIds?: string[];
};

export type AgentmonLineage = {
  format: "agentmon.lineage/v1";
  genesisDNA: string;
  currentDNA: string;
  generation: number;
  originTrainer: string;
  currentTrainer: string;
  events: AgentmonLineageEvent[];
};

export type AgentmonSkillTree = {
  inheritedSkills: LearnedSkill[];
  acquiredSkills: LearnedSkill[];
  fusionMoves: FusionMove[];
  inheritedLoops: AgentLoop[];
  acquiredLoops: AgentLoop[];
};

export type AgentmonOwnership = {
  status: "unregistered" | "origin" | "unverified-copy" | "verified-transfer" | "pending-transfer";
  ownerName: string;
  ownerFingerprint?: string;
  certificateId?: string;
  acquiredAt: string;
  transferSequence?: number;
  pendingTransfer?: {
    certificateId: string;
    toFingerprint: string;
    issuedAt: string;
    expiresAt: string;
    priorStatus: "origin" | "verified-transfer";
  };
};

export type Agentmon = {
  creationVersion?: "2.0" | "3.0" | "4.0";
  id: string;
  dna: string;
  trainerName: string;
  species: string;
  nameForge?: NameForgeProfile;
  nameHistory?: Array<{ name: string; at: string }>;
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
  growthPromptprint?: Promptprint;
  moves: Move[];
  learnedSkills: LearnedSkill[];
  observations?: PromptObservation[];
  decisionEpisodes?: DecisionEpisode[];
  behaviorHypotheses?: BehaviorHypothesis[];
  skillCandidates?: SkillCandidate[];
  proceduralSkills?: ProceduralSkill[];
  procedureProposals?: Array<Record<string, unknown> & { id: string; trainerReview?: ProcedureReview; status?: string }>;
  procedureTrials?: ProcedureTrial[];
  arenaReport?: AgentmonArenaReport;
  outcomeEvents?: Array<Record<string, unknown> & { id: string; procedureIds: string[]; recordedAt: string }>;
  effectivenessReport?: Record<string, unknown>;
  portabilityResults?: Array<Record<string, unknown>>;
  portabilityReport?: Record<string, unknown>;
  hatchReadiness?: HatchReadiness;
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
  form?: string;
  evolutionStage?: number;
  lineage?: AgentmonLineage;
  skillTree?: AgentmonSkillTree;
  ownership?: AgentmonOwnership;
};

export type TradePackage = {
  format: "agentmon.trade/v3";
  exportedAt: string;
  creature: Omit<Agentmon, "trainedAt">;
  manifest: {
    mode: "whole-agentmon";
    creatureId: string;
    genesisDNA: string;
    currentDNA: string;
    generation: number;
    includedSections: Array<"identity" | "genome" | "promptprint" | "capabilities" | "procedures" | "proof" | "lineage" | "ownership">;
    omittedPrivateSections: Array<"raw-prompts" | "decision-episodes" | "prompt-observations" | "credentials" | "private-keys" | "skill-package-bodies">;
    counts: { learnedSkills: number; loops: number; procedures: number; procedureTrials: number; provenProcedures: number; lineageEvents: number };
    sectionDigests?: Record<string, string>;
    manifestDigest?: string;
  };
  privacy: { rawPromptsIncluded: false; credentialsIncluded: false; skillPackageContentsIncluded: false };
  integrity?: { algorithm: "sha256"; digest: string };
};
