#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign as signPayload, verify as verifySignature } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createQuest,
  databaseStatus,
  listAgentmonSnapshots,
  listQuests,
  migrateLegacyAgentmonData,
  persistAgentmonSnapshot,
  persistArenaRun,
  persistOwnershipEvent,
  persistTrainerIdentity,
  readAgentmonSnapshot,
} from "./agentmon-db.mjs";
import {
  createCodexCliArenaProvider,
  createOpenAICompatibleArenaProvider,
  runArenaSuite,
  validateArenaSuite,
} from "../lib/arena-harness.mjs";
import {
  addHeldoutTask,
  createProofExperiment,
  proofDigest,
  proofReadiness,
} from "../lib/proof-protocol.mjs";
import { createSignedTransfer, createTrainerIdentity, loadTrainerIdentity, sealTradePackage, sha256, updateOwnershipRegistry, verifySignedTransfer, verifyTradePackage } from "../lib/ownership/transfer-crypto.mjs";
import { recordPortabilityResult } from "../lib/effectiveness/portability-engine.mjs";
import { formatCard, processFeed, updateSquad } from "../lib/runtime/training-service.mjs";
import { COLLECTOR_PATH, DEFAULT_INTERVAL, ENGINE_VERSION, FORMAT, SCRIPT_PATH, VALID_INTENTS, VALID_OUTCOMES, VALID_PROVIDERS, VALID_QUALITIES, VALID_REVIEWS, VALID_ROLES, VALID_VARIANTS, atomicWrite, growthProfile, loadEngine, pathsFor, readAgentmonState, readJson, safeSlot, sleep, validateFeed, writeJson } from "../lib/runtime/storage.mjs";
import { correctIntentCommand, enrollProofTaskCommand, persistDerivedMutation, recordArenaTrialCommand, reviewProcedureCommand, showArena, showProofStatus, startProofCommand } from "../lib/runtime/procedure-proof-service.mjs";
import { acceptTransfer, deployAgentmon, evolveAgentmonSlot, exportAgentmon, importAgentmon, listSquad, showIdentity, showRegistry, transferSlot, cancelTransfer } from "../lib/runtime/package-lifecycle-service.mjs";
import { authorizeAgentmonTransitionCommand, certifyAgentmonCommand, finalizeEconomyTransferCommand, initializeEconomyAuthorityCommand, issueListingCommand, showEconomyRecordCommand, verifyAgentmonCommand } from "../lib/runtime/economy-service.mjs";
import { portabilityRecordCommand, portabilityRunCommand, recordOutcomeCommand, routeContextCommand, semanticReviewCommand, semanticSuggestCommand, showEffectivenessCommand, squadPlanCommand } from "../lib/runtime/v4-learning-service.mjs";

export { createSignedTransfer, createTrainerIdentity, sealTradePackage, verifySignedTransfer, verifyTradePackage } from "../lib/ownership/transfer-crypto.mjs";
export { formatCard, processFeed } from "../lib/runtime/training-service.mjs";
export { correctIntent, enrollProofTask, getProofStatus, proposeProcedure, recordArenaTrial, reviewProcedure, startProofExperiment } from "../lib/runtime/procedure-proof-service.mjs";
export { acceptSignedTransfer, cancelSignedTransfer, evolveAgentmonSlot, exportDeploymentPack, importAgentmonPackage, issueSignedTransfer } from "../lib/runtime/package-lifecycle-service.mjs";

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "help";
  const args = { command, rootDir: process.cwd(), slot: "main", interval: DEFAULT_INTERVAL };
  const start = argv[0] && !argv[0].startsWith("-") ? 1 : 0;
  const valueOptions = new Set(["--slot", "--name", "--role", "--provider", "--model", "--mission", "--thread", "--cwd", "--feed", "--file", "--suite", "--targets", "--proof", "--target", "--minimum", "--to", "--certificate", "--out", "--interval", "--count", "--candidate", "--title", "--objective", "--source", "--intent", "--procedure", "--proposal", "--review", "--variant", "--quality", "--outcome", "--rating", "--task-digest", "--retry-count", "--correction-level", "--permissions", "--baseline-score", "--agentmon-score", "--suite-digest", "--repetitions", "--seed", "--judge-model", "--temperature", "--max-output-tokens", "--reasoning-effort", "--registry-root", "--listing", "--sequence", "--expires-hours", "--kind"]);
  for (let index = start; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") args.command = "help";
    else if (valueOptions.has(option)) {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${option} requires a value.`);
      if (option === "--slot") args.slot = safeSlot(value);
      else if (option === "--name") args.name = value;
      else if (option === "--role") args.role = value;
      else if (option === "--provider") args.provider = value;
      else if (option === "--model") args.model = value;
      else if (option === "--mission") args.mission = value;
      else if (option === "--thread") args.thread = value;
      else if (option === "--cwd") args.rootDir = resolve(value);
      else if (option === "--feed") args.feed = resolve(args.rootDir, value);
      else if (option === "--file") args.file = resolve(args.rootDir, value);
      else if (option === "--suite") args.suite = resolve(args.rootDir, value);
      else if (option === "--targets") args.targets = resolve(args.rootDir, value);
      else if (option === "--proof") args.proof = value;
      else if (option === "--target") args.target = Math.max(5, Math.min(50, Number(value) || 12));
      else if (option === "--minimum") args.minimum = Math.max(5, Math.min(50, Number(value) || 10));
      else if (option === "--to") args.to = value;
      else if (option === "--certificate") args.certificate = value;
      else if (option === "--out") args.out = resolve(args.rootDir, value);
      else if (option === "--interval") args.interval = Math.max(500, Number(value) || DEFAULT_INTERVAL);
      else if (option === "--count") args.count = Math.max(1, Math.min(50, Number(value) || 12));
      else if (option === "--candidate") args.candidate = Math.max(1, Math.min(50, Number(value) || 1));
      else if (option === "--title") args.title = value;
      else if (option === "--objective") args.objective = value;
      else if (option === "--source") args.source = value;
      else if (option === "--intent") args.intent = value;
      else if (option === "--procedure") args.procedure = value;
      else if (option === "--proposal") args.proposal = value;
      else if (option === "--review") args.review = value;
      else if (option === "--variant") args.variant = value;
      else if (option === "--quality") args.quality = value;
      else if (option === "--outcome") args.outcome = value;
      else if (option === "--rating") args.rating = value;
      else if (option === "--task-digest") args.taskDigest = value;
      else if (option === "--retry-count") args.retryCount = Math.max(0, Math.min(20, Number(value) || 0));
      else if (option === "--correction-level") args.correctionLevel = value;
      else if (option === "--permissions") args.permissions = value;
      else if (option === "--baseline-score") args.baselineScore = Number(value);
      else if (option === "--agentmon-score") args.agentmonScore = Number(value);
      else if (option === "--suite-digest") args.suiteDigest = value;
      else if (option === "--repetitions") args.repetitions = Math.max(1, Math.min(20, Number(value) || 1));
      else if (option === "--seed") args.seed = value;
      else if (option === "--judge-model") args.judgeModel = value;
      else if (option === "--temperature") args.temperature = Number(value);
      else if (option === "--max-output-tokens") args.maxOutputTokens = Math.max(1, Number(value) || 1200);
      else if (option === "--reasoning-effort") args.reasoningEffort = value;
      else if (option === "--registry-root") args.registryRoot = resolve(args.rootDir, value);
      else if (option === "--listing") args.listing = value;
      else if (option === "--sequence") args.sequence = Number(value);
      else if (option === "--expires-hours") args.expiresHours = Math.max(1, Math.min(168, Number(value) || 24));
      else if (option === "--kind") args.kind = value;
    } else throw new Error(`Unknown option: ${option}`);
  }
  args.slot = safeSlot(args.slot);
  return args;
}

function help() {
  return `Agentmon Creation Engine V4

Usage:
  npm run agentmon -- watch [--slot main] [--thread ID] [--name NAME] [--role builder]
  npm run agentmon -- hatch [--feed PATH] [--slot main]
  npm run agentmon -- train [--feed PATH] [--slot main]
  npm run agentmon -- inspect [--slot main]
  npm run agentmon -- creation [--slot main]
  npm run agentmon -- names [--slot main] [--count 12]
  npm run agentmon -- reforge-name [--slot main] --candidate NUMBER
  npm run agentmon -- correct-intent --source latest|ID --intent INTENT [--slot main]
  npm run agentmon -- review-procedure --procedure ID --review confirmed|rejected [--slot main]
  npm run agentmon -- proof-start --procedure ID [--target 12] [--minimum 10]
  npm run agentmon -- proof-add --file HELDOUT_TASK.json [--proof ID]
  npm run agentmon -- proof-status [--proof ID]
  npm run agentmon -- arena-record --procedure ID --variant baseline|agentmon --quality pass|fail [--outcome success|failure|unknown]
  npm run agentmon -- arena-validate --suite PATH
  npm run agentmon -- arena-run --suite PATH --procedure ID --model MODEL [--provider local|codex] [--judge-model MODEL]
  npm run agentmon -- arena [--slot main]
  npm run agentmon -- outcome-record --procedure ID --task-digest SHA256 --outcome success|failure|unknown --rating helped|neutral|missed
  npm run agentmon -- effectiveness [--slot main]
  npm run agentmon -- route --file TASK.txt --permissions read-files,run-tools
  npm run agentmon -- semantic-suggest [--slot main]
  npm run agentmon -- semantic-review --proposal ID --review confirmed|rejected
  npm run agentmon -- portability-record --procedure ID --provider local --model MODEL --suite-digest SHA256 --baseline-score 60 --agentmon-score 80
  npm run agentmon -- portability-run --procedure ID --suite PATH --targets MODEL_TARGETS.json
  npm run agentmon -- squad-plan --objective TEXT --permissions read-files,run-tools
  npm run agentmon -- skills [--slot main]
  npm run agentmon -- refresh-skill [--slot main]
  npm run agentmon -- deploy [--slot main] [--out DIRECTORY]
  npm run agentmon -- verify [--slot main] [--out DEPLOY_DIRECTORY]
  npm run agentmon -- authority-init [--registry-root DIRECTORY] [--name NAME]
  npm run agentmon -- authority-certify [--slot main] [--registry-root DIRECTORY]
  npm run agentmon -- economy-transition --kind learning|evolution [--slot main] [--registry-root DIRECTORY]
  npm run agentmon -- economy-list [--slot main] [--registry-root DIRECTORY] [--expires-hours 24]
  npm run agentmon -- economy-transfer --listing ID --to FINGERPRINT --sequence NUMBER [--registry-root DIRECTORY]
  npm run agentmon -- economy-status [--slot main] [--registry-root DIRECTORY]
  npm run agentmon -- lineage [--slot main]
  npm run agentmon -- squad
  npm run agentmon -- db-init
  npm run agentmon -- db-status
  npm run agentmon -- quest-create --title TITLE --objective OBJECTIVE
  npm run agentmon -- quests
  npm run agentmon -- identity [--name TRAINER]
  npm run agentmon -- transfer --slot SLOT --to RECIPIENT_FINGERPRINT [--out PATH]
  npm run agentmon -- transfer-cancel --slot SLOT --certificate CERTIFICATE_ID
  npm run agentmon -- accept --file TRANSFER.json --slot SLOT
  npm run agentmon -- registry
  npm run agentmon -- export [--slot main] [--out PATH]
  npm run agentmon -- import --file TRADE.json --slot SLOT --name NEW_TRAINER
  npm run agentmon -- evolve [--slot SLOT]

Creation V4 learns from decision-time evidence, lets trainers correct intent, compiles bounded semantic candidates, proves procedures against a baseline arena, and measures raw-free real-world usefulness. NameForge creates deterministic cross-linguistic sound blends for new hatches. Outcomes remain separate from proof. Raw prompts and responses remain outside the ledger, database, trade package, and runtime pack.`;
}

async function trainOnce(args) {
  const paths = pathsFor(args.rootDir, args.slot);
  const feedPath = args.feed || (await readJson(paths.feed) ? paths.feed : resolve(args.rootDir, ".agentmon/codex-feed.json"));
  const feed = await readJson(feedPath);
  if (!feed) throw new Error(`No feed found at ${feedPath}. Run watch or the collector first.`);
  const result = await processFeed(feed, args);
  process.stdout.write(`${result.changed ? formatCard(result) : `Agentmon ${args.slot} is already current.`}\n`);
  if (result.changed) process.stdout.write(`${result.action === "hatched" ? "Hatched" : "Trained"}. Open ledger: ${result.paths.ledger}\nSKILL.md: ${result.paths.skill}\n`);
}

async function watch(args) {
  const paths = pathsFor(args.rootDir, args.slot);
  await mkdir(dirname(paths.feed), { recursive: true });
  const collectorArgs = [COLLECTOR_PATH, "--watch", "--cwd", args.rootDir, "--out", paths.feed, "--interval", String(Math.max(1000, args.interval))];
  if (args.thread) collectorArgs.push("--thread", args.thread);
  const collector = spawn(process.execPath, collectorArgs, { cwd: args.rootDir, stdio: ["ignore", "inherit", "inherit"] });
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (!collector.killed) collector.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  collector.once("error", (error) => { process.stderr.write(`Collector failed: ${error.message}\n`); stopping = true; });
  collector.once("exit", (code) => { if (!stopping && code) process.stderr.write(`Collector exited with code ${code}.\n`); stopping = true; });
  process.stdout.write(`Agentmon loop open for slot '${args.slot}'. Observing submitted prompts only; press Ctrl+C to stop.\n`);
  let shownRevision = null;
  while (!stopping) {
    const feed = await readJson(paths.feed);
    if (feed?.revision && feed.revision !== shownRevision) {
      const result = await processFeed(feed, args);
      shownRevision = feed.revision;
      if (result.changed) process.stdout.write(`${formatCard(result)}\n${result.action === "hatched" ? "Hatched" : "Trained"}; ledger and SKILL.md updated.\n`);
    }
    await sleep(args.interval);
  }
}

async function inspect(args) {
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  process.stdout.write(`${formatCard({ agentmon: state })}\n`);
}

async function refreshSkillCommand(args) {
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const { createSkillsMarkdown } = await loadEngine();
  const paths = pathsFor(args.rootDir, args.slot);
  await atomicWrite(paths.skill, createSkillsMarkdown(state));
  process.stdout.write(`Refreshed ${state.form ?? state.species} complete identity skill.\n${paths.skill}\n`);
}

async function previewNames(args) {
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const { generateAgentmonNameCandidates } = await loadEngine();
  const candidates = generateAgentmonNameCandidates(state, args.count || 12);
  process.stdout.write(`${state.form ?? state.species} NameForge candidates (preview only)\n`);
  for (const candidate of candidates) process.stdout.write(`- ${candidate.name} · ${candidate.soundPacks.join(" + ")} · ${candidate.seedDigest}\n`);
  process.stdout.write("Existing hatch identity was not changed. Names use synthetic sound blends, not copied words.\n");
}

async function reforgeNameCommand(args) {
  if (!args.candidate) throw new Error("reforge-name requires --candidate NUMBER from the names preview.");
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const { reforgeAgentmonName } = await loadEngine();
  const previousName = state.form ?? state.species;
  const agentmon = reforgeAgentmonName(state, args.candidate);
  const result = await persistDerivedMutation(args.rootDir, args.slot, agentmon, "name-reforge", {
    naming: { previousName, nextName: agentmon.form ?? agentmon.species, candidate: args.candidate, seedDigest: agentmon.nameForge.seedDigest },
  });
  process.stdout.write(`Name reforged: ${previousName} → ${result.agentmon.form ?? result.agentmon.species}\nDNA unchanged: ${result.agentmon.lineage?.currentDNA ?? result.agentmon.dna}\n`);
}

async function listSkills(args) {
  const paths = pathsFor(args.rootDir, args.slot);
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  process.stdout.write(`${state.species} learned capabilities\n`);
  for (const skill of state.learnedSkills) process.stdout.write(`- ${skill.name}: evidence ${skill.evidence}\n`);
  if (state.skillTree) {
    process.stdout.write(`Inherited branch: ${state.skillTree.inheritedSkills.length}\n`);
    process.stdout.write(`Acquired branch: ${state.skillTree.acquiredSkills.length}\n`);
    process.stdout.write("Fusion moves\n");
    for (const move of state.skillTree.fusionMoves) process.stdout.write(`- ${move.name}: ${move.inheritedTrainer} × ${move.acquiredTrainer}\n`);
  }
  process.stdout.write("Loops\n");
  for (const loop of state.loops) process.stdout.write(`- ${loop.name}: evidence ${loop.evidence}\n`);
  process.stdout.write(`Portable skill: ${paths.skill}\n`);
}

async function showCreationProfile(args) {
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const observations = state.observations || [];
  const counts = Object.fromEntries([...new Set(observations.map((observation) => observation.intent))]
    .map((intent) => [intent, observations.filter((observation) => observation.intent === intent).length]));
  process.stdout.write(`${state.form ?? state.species} · Creation Engine ${state.creationVersion || "legacy"}\n`);
  if (state.hatchReadiness) {
    process.stdout.write(`Readiness: ${state.hatchReadiness.score}/100 · ${state.hatchReadiness.ready ? "stable" : "calibrating"}\n`);
    process.stdout.write(`Evidence: ${state.hatchReadiness.behavioralPrompts} behavioral / ${state.hatchReadiness.distinctPrompts} total prompts\n`);
    for (const reason of state.hatchReadiness.reasons) process.stdout.write(`- ${reason}\n`);
  }
  process.stdout.write(`Intent mix: ${Object.entries(counts).map(([intent, count]) => `${intent} ${count}`).join(" · ") || "not available"}\n`);
  const corrected = (state.decisionEpisodes || []).filter((episode) => episode.resolution.status === "trainer-corrected").length;
  process.stdout.write(`Decision episodes: ${state.decisionEpisodes?.length || 0} · trainer-corrected ${corrected}\n`);
  process.stdout.write(`Behavior hypotheses: ${state.behaviorHypotheses?.length || 0} · strengthened ${(state.behaviorHypotheses || []).filter((hypothesis) => hypothesis.status === "strengthened").length} · weakened ${(state.behaviorHypotheses || []).filter((hypothesis) => hypothesis.status === "weakened").length}\n`);
  process.stdout.write("Capability candidates\n");
  for (const candidate of state.skillCandidates || []) {
    process.stdout.write(`- ${candidate.name}: ${candidate.stage} · ${candidate.behavioralEvidenceCount}/${candidate.evidenceCount} behavioral/total · ${candidate.confidence}%\n`);
  }
  process.stdout.write("Procedures\n");
  for (const procedure of state.proceduralSkills || []) {
    const arena = state.arenaReport?.results?.find((result) => result.procedureId === procedure.id);
    process.stdout.write(`- ${procedure.name} [${procedure.id}]: ${procedure.stage} · ${procedure.confidence}% · trainer ${procedure.trainerReview || "unreviewed"} · arena ${arena?.status || "untested"}\n`);
  }
  process.stdout.write("Raw prompt text stored in profile: no\n");
}

async function validateArenaSuiteCommand(args) {
  if (!args.suite) throw new Error("arena-validate requires --suite PATH.");
  const suite = validateArenaSuite(await readJson(args.suite));
  const checkCount = suite.tasks.reduce((sum, task) => sum + (task.rubric?.checks?.length || 0), 0);
  process.stdout.write(`Arena suite valid: ${suite.id} v${suite.version}\nTasks: ${suite.tasks.length}\nDeterministic checks: ${checkCount}\n${args.suite}\n`);
}

async function runAutomaticArenaCommand(args) {
  if (!args.suite || !args.procedure) throw new Error("arena-run requires --suite PATH and --procedure ID.");
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const suite = validateArenaSuite(await readJson(args.suite));
  const model = args.model || process.env.AGENTMON_ARENA_MODEL || process.env.AGENTMON_LOCAL_MODEL;
  if (!model) throw new Error("arena-run requires --model or AGENTMON_ARENA_MODEL.");
  const providerKind = args.provider || "local";
  if (!new Set(["local", "codex"]).has(providerKind)) throw new Error("arena-run --provider must be local or codex.");
  const baseUrl = process.env.AGENTMON_ARENA_MODEL_URL || process.env.AGENTMON_LOCAL_MODEL_URL || "http://127.0.0.1:11434/v1";
  const contestant = providerKind === "codex"
    ? createCodexCliArenaProvider({ cwd: args.rootDir, model, reasoningEffort: args.reasoningEffort || "medium" })
    : createOpenAICompatibleArenaProvider({
      baseUrl,
      model,
      temperature: args.temperature ?? 0,
      maxOutputTokens: args.maxOutputTokens || 1200,
      seed: Number(args.seed) || 7,
    });
  const judgeModel = args.judgeModel || process.env.AGENTMON_ARENA_JUDGE_MODEL;
  const judge = judgeModel
    ? providerKind === "codex"
      ? createCodexCliArenaProvider({ cwd: args.rootDir, model: judgeModel, reasoningEffort: args.reasoningEffort || "medium" })
      : createOpenAICompatibleArenaProvider({
        baseUrl: process.env.AGENTMON_ARENA_JUDGE_URL || baseUrl,
        model: judgeModel,
        temperature: 0,
        maxOutputTokens: 500,
        seed: Number(args.seed) || 17,
      })
    : null;
  const result = await runArenaSuite({
    suite,
    agentmon: state,
    procedureId: args.procedure,
    contestant,
    judge,
    repetitions: args.repetitions || 1,
    seed: args.seed,
  });
  const startingTrialIds = new Set((state.procedureTrials || []).map((trial) => trial.id));
  const arenaTrials = (result.agentmon.procedureTrials || []).filter((trial) => !startingTrialIds.has(trial.id));
  const latestState = await readAgentmonState(args.rootDir, args.slot);
  if (!latestState) throw new Error(`Agentmon in slot '${args.slot}' disappeared during the arena run.`);
  const { recordAgentmonArenaTrial } = await loadEngine();
  result.agentmon = arenaTrials.reduce((current, trial) => recordAgentmonArenaTrial(current, {
    procedureId: trial.procedureId,
    variant: trial.variant,
    decisionQuality: trial.decisionQuality,
    outcome: trial.outcome,
    source: trial.source,
    runId: trial.runId,
  }), latestState);
  result.agentmon = recordPortabilityResult(result.agentmon, {
    procedureId: args.procedure,
    provider: providerKind === "codex" ? "openai" : "local",
    model,
    suiteDigest: result.run.lockedConfig.suite.digest,
    baselineScore: result.run.summary.baseline.averageScore,
    agentmonScore: result.run.summary.agentmon.averageScore,
    recordedAt: result.run.completedAt,
  }).agentmon;
  const artifactDir = args.out || resolve(args.rootDir, ".agentmon/arena/runs", result.run.id);
  await writeJson(resolve(artifactDir, "run.json"), result.run);
  await persistDerivedMutation(args.rootDir, args.slot, result.agentmon, "arena-run", {
    arenaRun: {
      id: result.run.id,
      procedureId: result.run.procedureId,
      configDigest: result.run.configDigest,
      summary: result.run.summary,
      status: result.run.status,
      startedAt: result.run.startedAt,
      completedAt: result.run.completedAt,
      rawPromptsStored: false,
      rawOutputsStored: false,
    },
  });
  await persistArenaRun(args.rootDir, result.run);
  const summary = result.run.summary;
  const arena = result.agentmon.arenaReport.results.find((item) => item.procedureId === args.procedure);
  const genericLine = summary.generic ? `Generic: ${summary.generic.averageScore}/100 · ${summary.generic.passRate}% pass\nPersonalization: ${summary.personalization.status} · ${summary.personalization.averageScoreLiftVsGeneric >= 0 ? "+" : ""}${summary.personalization.averageScoreLiftVsGeneric} score vs generic\n` : "";
  process.stdout.write(`Arena complete: ${suite.id} v${suite.version}\nBaseline: ${summary.baseline.averageScore}/100 · ${summary.baseline.passRate}% pass\n${genericLine}Agentmon: ${summary.agentmon.averageScore}/100 · ${summary.agentmon.passRate}% pass\nLift: ${summary.averageScoreLift >= 0 ? "+" : ""}${summary.averageScoreLift} score · ${summary.passRateLift >= 0 ? "+" : ""}${summary.passRateLift} pass-rate points\nProcedure status: ${arena?.status || "untested"}\nLocal artifacts: ${resolve(artifactDir, "run.json")}\nDatabase contains scores and digests only; prompts and outputs remain in the local artifact.\n`);
}

async function evolveSlot(args) {
  const result = await evolveAgentmonSlot(args);
  process.stdout.write(`${formatCard(result)}\nEvolution complete. DNA ${result.agentmon.lineage.events.at(-1).fromDNA} → ${result.agentmon.dna}\n`);
}

async function showLineage(args) {
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const lineage = state.lineage;
  if (!lineage) { process.stdout.write("Legacy Agentmon; train once to initialize lineage.\n"); return; }
  process.stdout.write(`${state.form ?? state.species} · generation ${lineage.generation}\nGenesis DNA: ${lineage.genesisDNA}\nCurrent DNA: ${lineage.currentDNA}\n`);
  for (const event of lineage.events) process.stdout.write(`- ${event.type}: ${event.trainer} · ${event.at}${event.fromTrainer ? ` · from ${event.fromTrainer}` : ""}\n`);
}

async function initializeDatabase(args) {
  const migrated = await migrateLegacyAgentmonData(args.rootDir);
  const status = await databaseStatus(args.rootDir);
  process.stdout.write(`Local database ready: ${migrated.path}\n`);
  process.stdout.write(`Schema ${status.schemaVersion} · ${status.agentmons} Agentmon · ${status.events} events · ${status.candidates} candidates · ${status.procedures} procedures · ${status.episodes} decision episodes · ${status.arenaTrials} arena trials · ${status.outcomes} outcomes · ${status.pendingSync} pending sync envelopes\n`);
  process.stdout.write(`Imported this run: ${migrated.importedAgentmons} Agentmon · ${migrated.importedEvents} events\n`);
}

async function showDatabaseStatus(args) {
  const status = await databaseStatus(args.rootDir);
  process.stdout.write(`${status.path}\n`);
  process.stdout.write(`Project: ${status.projectId}\nSchema: ${status.schemaVersion}\n`);
  process.stdout.write(`Agentmons: ${status.agentmons}\nEvents: ${status.events}\nSkills: ${status.skills}\nObservations: ${status.observations}\nDecision episodes: ${status.episodes}\nHypotheses: ${status.hypotheses}\nCandidates: ${status.candidates}\nProcedures: ${status.procedures}\nArena trials: ${status.arenaTrials}\nAutomatic arena runs: ${status.arenaRuns}\nOutcomes: ${status.outcomes}\nPortability results: ${status.portabilityResults}\nQuests: ${status.quests}\nMissions: ${status.missions}\nRuns: ${status.runs}\nPending sync: ${status.pendingSync}\n`);
}

async function createQuestCommand(args) {
  const quest = await createQuest(args.rootDir, { title: args.title, objective: args.objective });
  process.stdout.write(`Quest created: ${quest.title}\n${quest.id}\nStatus: ${quest.status}\nObjective: ${quest.objective}\n`);
}

async function listQuestCommand(args) {
  const quests = await listQuests(args.rootDir);
  if (!quests.length) {
    process.stdout.write("No quests created yet.\n");
    return;
  }
  for (const quest of quests) process.stdout.write(`${quest.id}\t${quest.status}\t${quest.title}\t${quest.objective}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") process.stdout.write(`${help()}\n`);
  else if (args.command === "watch") await watch(args);
  else if (args.command === "hatch" || args.command === "train") await trainOnce(args);
  else if (args.command === "inspect") await inspect(args);
  else if (args.command === "names") await previewNames(args);
  else if (args.command === "reforge-name") await reforgeNameCommand(args);
  else if (args.command === "creation") await showCreationProfile(args);
  else if (args.command === "correct-intent") await correctIntentCommand(args);
  else if (args.command === "review-procedure") await reviewProcedureCommand(args);
  else if (args.command === "proof-start") await startProofCommand(args);
  else if (args.command === "proof-add") await enrollProofTaskCommand(args);
  else if (args.command === "proof-status") await showProofStatus(args);
  else if (args.command === "arena-record") await recordArenaTrialCommand(args);
  else if (args.command === "arena-validate") await validateArenaSuiteCommand(args);
  else if (args.command === "arena-run") await runAutomaticArenaCommand(args);
  else if (args.command === "arena") await showArena(args);
  else if (args.command === "outcome-record") await recordOutcomeCommand(args);
  else if (args.command === "effectiveness") await showEffectivenessCommand(args);
  else if (args.command === "route") await routeContextCommand(args);
  else if (args.command === "semantic-suggest") await semanticSuggestCommand(args);
  else if (args.command === "semantic-review") await semanticReviewCommand(args);
  else if (args.command === "portability-record") await portabilityRecordCommand(args);
  else if (args.command === "portability-run") await portabilityRunCommand(args);
  else if (args.command === "squad-plan") await squadPlanCommand(args);
  else if (args.command === "skills") await listSkills(args);
  else if (args.command === "refresh-skill") await refreshSkillCommand(args);
  else if (args.command === "deploy") await deployAgentmon(args);
  else if (args.command === "verify") await verifyAgentmonCommand(args);
  else if (args.command === "authority-init") await initializeEconomyAuthorityCommand(args);
  else if (args.command === "authority-certify") await certifyAgentmonCommand(args);
  else if (args.command === "economy-transition") await authorizeAgentmonTransitionCommand(args);
  else if (args.command === "economy-list") await issueListingCommand(args);
  else if (args.command === "economy-transfer") await finalizeEconomyTransferCommand(args);
  else if (args.command === "economy-status") await showEconomyRecordCommand(args);
  else if (args.command === "lineage") await showLineage(args);
  else if (args.command === "squad") await listSquad(args);
  else if (args.command === "db-init") await initializeDatabase(args);
  else if (args.command === "db-status") await showDatabaseStatus(args);
  else if (args.command === "quest-create") await createQuestCommand(args);
  else if (args.command === "quests") await listQuestCommand(args);
  else if (args.command === "identity") await showIdentity(args);
  else if (args.command === "transfer") await transferSlot(args);
  else if (args.command === "transfer-cancel") await cancelTransfer(args);
  else if (args.command === "accept") await acceptTransfer(args);
  else if (args.command === "registry") await showRegistry(args);
  else if (args.command === "export") await exportAgentmon(args);
  else if (args.command === "import") await importAgentmon(args);
  else if (args.command === "evolve") await evolveSlot(args);
  else throw new Error(`Unknown command: ${args.command}`);
}

function invokedAsMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(SCRIPT_PATH); }
  catch { return false; }
}

if (invokedAsMain()) {
  main().catch((error) => {
    process.stderr.write(`Agentmon error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
