import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acceptSignedTransfer, cancelSignedTransfer, correctIntent, createSignedTransfer, createTrainerIdentity, evolveAgentmonSlot, exportDeploymentPack, importAgentmonPackage, issueSignedTransfer, processFeed, proposeProcedure, recordArenaTrial, reviewProcedure, sealTradePackage, verifySignedTransfer, verifyTradePackage } from "../scripts/agentmon.mjs";
import { createQuest, databaseStatus, listQuests, migrateLegacyAgentmonData, openAgentmonDatabase } from "../scripts/agentmon-db.mjs";
import { createTradePackage, forgeAgentmonName, generateAgentmonNameCandidates, reforgeAgentmonName } from "../lib/agentmon-engine.mjs";

function feed(revision, prompts, threadId = "task-1") {
  return {
    format: "agentmon.feed/v1",
    source: "codex",
    revision,
    generatedAt: new Date().toISOString(),
    consent: { scope: "user_prompts_only" },
    thread: { id: threadId, label: "Test task" },
    prompts: prompts.map((text, index) => ({ id: `${threadId}-prompt-${index + 1}`, text, chars: text.length, redactions: 0 })),
    totals: { prompts: prompts.length, characters: prompts.reduce((sum, text) => sum + text.length, 0), redactions: 0 },
  };
}

test("hatches, trains, and writes a raw-text-free open ledger", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-loop-"));
  try {
    const privatePhrase = "Build my cobalt orchard compiler with a verify and retry loop.";
    const first = await processFeed(feed("revision-1", [privatePhrase]), { rootDir, slot: "main", name: "Nova", role: "builder" });
    assert.equal(first.action, "hatched");
    assert.equal(first.agentmon.sourceCount, 1);
    assert.equal(first.agentmon.nameForge.format, "agentmon.nameforge/v1");
    assert.match(first.agentmon.species, /^[A-Z][a-z]{3,12}$/);

    const second = await processFeed(feed("revision-2", [privatePhrase, "Use tools and tests, then validate the result."]), { rootDir, slot: "main" });
    assert.equal(second.action, "trained");
    assert.equal(second.agentmon.id, first.agentmon.id);
    assert.equal(second.agentmon.species, first.agentmon.species);
    assert.equal(second.agentmon.promptprint.archetype, first.agentmon.promptprint.archetype);
    assert.deepEqual(second.agentmon.traits, first.agentmon.traits);
    assert.deepEqual(second.agentmon.promptprint.dimensions, first.agentmon.promptprint.dimensions);
    assert.equal(second.agentmon.growthPromptprint.sampleCount, 2);
    assert.equal(second.agentmon.sourceCount, 2);

    const ledger = await readFile(second.paths.ledger, "utf8");
    const ledgerData = JSON.parse(ledger);
    const skill = await readFile(second.paths.skill, "utf8");
    assert.doesNotMatch(ledger, /cobalt orchard compiler/i);
    assert.equal(ledgerData.entries.at(-1).engineVersion, "0.8.0");
    assert.match(skill, /^---\nname: [a-z0-9-]+\ndescription:/);
    assert.match(skill, /Permanent archetype/);
    assert.match(skill, /Hatch-locked resonance \(individual\):/);
    assert.match(skill, /# Complete Identity Contract/);
    assert.match(skill, /Capability evidence never grants tools/);
    assert.match(skill, /Observed Prompting Patterns/);
    assert.match(skill, /Raw prompt history, credentials, private keys, and hidden reasoning are not included/);
    assert.equal(second.agentmon.creationVersion, "4.0");
    assert.equal(second.agentmon.observations.length, 2);
    assert.equal(second.agentmon.hatchReadiness.distinctPrompts, 2);
    assert.equal(second.agentmon.observations.some((observation) => "content" in observation), false);
    assert.equal(second.agentmon.decisionEpisodes.length, 2);

    const status = await databaseStatus(rootDir);
    assert.equal(status.agentmons, 1);
    assert.equal(status.events, 2);
    assert.equal(status.pendingSync, 2);
    const store = openAgentmonDatabase(rootDir);
    const databaseEvents = store.db.prepare("SELECT payload_json FROM agentmon_events ORDER BY sequence").all();
    store.db.close();
    assert.equal(databaseEvents.some((event) => event.payload_json.includes(privatePhrase)), false);

    const unchanged = await processFeed(feed("revision-2", [privatePhrase, "Use tools and tests, then validate the result."]), { rootDir, slot: "main" });
    assert.equal(unchanged.changed, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("forges deterministic, diverse, portable Agentmon names", async () => {
  const first = forgeAgentmonName("DNA|trainer|slot-main", "reliability", "toolcraft");
  const repeated = forgeAgentmonName("DNA|trainer|slot-main", "reliability", "toolcraft");
  const other = forgeAgentmonName("DNA|trainer|slot-scout", "reliability", "toolcraft");
  assert.deepEqual(repeated, first);
  assert.notEqual(other.name, first.name);
  assert.match(first.name, /^[A-Z][a-z]{3,12}$/);
  assert.equal(first.soundPacks.length, first.syllables.length);

  const agentmon = {
    traitKey: "reliability",
    traits: { reasoning: 60, curiosity: 40, reliability: 90, initiative: 50, empathy: 30, toolcraft: 80 },
    dna: "1234ABCD",
    trainerName: "Nova",
  };
  const candidates = generateAgentmonNameCandidates(agentmon, 24);
  assert.equal(candidates.length, 24);
  assert.equal(new Set(candidates.map((candidate) => candidate.asciiSkeleton)).size, 24);
  assert.equal(candidates.every((candidate) => candidate.moderation === "unreviewed"), true);
  const reforged = reforgeAgentmonName({ ...agentmon, species: "Guardot", trainedAt: "2026-01-01T00:00:00.000Z" }, 2);
  assert.equal(reforged.species, candidates[1].name);
  assert.equal(reforged.dna, agentmon.dna);
  assert.deepEqual(reforged.nameHistory, [{ name: "Guardot", at: "2026-01-01T00:00:00.000Z" }]);
});

test("trades, cross-trains, and permanently evolves a two-trainer lineage", async () => {
  const senderRoot = await mkdtemp(join(tmpdir(), "agentmon-sender-"));
  const recipientRoot = await mkdtemp(join(tmpdir(), "agentmon-recipient-"));
  const wrongRoot = await mkdtemp(join(tmpdir(), "agentmon-wrong-recipient-"));
  try {
    const originPrompts = [
      "Build code with connected tools and a repeatable ship loop.",
      "Implement the function, run the terminal tool, and check it.",
      "Write the patch with the API tool and execute the test suite.",
      "Debug the code using approved tools, then ship the verified result.",
    ];
    const recipientPrompts = [
      "Research every source, verify the evidence, and critique weak claims.",
      "Search primary sources and validate each material claim.",
      "Open current sources, cross-check the evidence, and fact-check conflicts.",
      "Verify citations and review unsupported research claims.",
    ];
    const sender = await createTrainerIdentity({ rootDir: senderRoot, name: "Trainer Alpha" });
    const recipient = await createTrainerIdentity({ rootDir: recipientRoot, name: "Trainer Beta" });
    await createTrainerIdentity({ rootDir: wrongRoot, name: "Trainer Wrong" });
    const origin = await processFeed(feed("origin-1", originPrompts, "task-origin"), { rootDir: senderRoot, slot: "origin", name: "Trainer Alpha", role: "builder" });
    const sealed = sealTradePackage(createTradePackage(origin.agentmon));
    assert.equal(verifyTradePackage(sealed).creature.id, origin.agentmon.id);
    assert.equal(sealed.format, "agentmon.trade/v3");
    assert.equal(sealed.manifest.mode, "whole-agentmon");
    assert.deepEqual(new Set(sealed.manifest.includedSections), new Set(["identity", "genome", "promptprint", "capabilities", "procedures", "proof", "lineage", "ownership"]));
    assert.equal(Object.keys(sealed.manifest.sectionDigests).length, 8);
    assert.doesNotMatch(JSON.stringify(sealed), /repeatable ship loop/i);

    const incomplete = createTradePackage(origin.agentmon);
    incomplete.manifest.includedSections = incomplete.manifest.includedSections.filter((section) => section !== "proof");
    assert.throws(() => verifyTradePackage(sealTradePackage(incomplete)), /missing a required section/);

    const tampered = structuredClone(sealed);
    tampered.creature.species = "Tampermon";
    assert.throws(() => verifyTradePackage(tampered), /integrity check failed/);

    const issued = await issueSignedTransfer({ rootDir: senderRoot, slot: "origin", to: recipient.fingerprint });
    assert.equal(issued.bundle.format, "agentmon.transfer/v2");
    assert.equal(issued.bundle.certificate.transferMode, "whole-agentmon");
    assert.equal(issued.bundle.certificate.sequence, 1);
    assert.equal(issued.agentmon.ownership.status, "pending-transfer");
    assert.equal(issued.bundle.certificate.from.fingerprint, sender.fingerprint);
    assert.doesNotMatch(JSON.stringify(issued.bundle), /repeatable ship loop/i);
    await assert.rejects(() => issueSignedTransfer({ rootDir: senderRoot, slot: "origin", to: recipient.fingerprint }), /pending transfer/);
    await assert.rejects(() => processFeed(feed("origin-pending", [...originPrompts, "Add another verified build step."], "task-origin"), { rootDir: senderRoot, slot: "origin" }), /frozen while transfer/);
    await assert.rejects(() => exportDeploymentPack({ rootDir: senderRoot, slot: "origin" }), /pending whole-Agentmon transfer/);
    const senderStore = openAgentmonDatabase(senderRoot);
    const signedEvents = senderStore.db.prepare("SELECT signature FROM agentmon_events WHERE signature IS NOT NULL").all();
    const syncEnvelopes = senderStore.db.prepare("SELECT envelope_json FROM sync_outbox ORDER BY created_at").all().map((row) => JSON.parse(row.envelope_json));
    senderStore.db.close();
    assert.ok(signedEvents.length >= 2);
    assert.equal(syncEnvelopes.every((event) => event.format === "agentmon.event/v1" && event.signature), true);
    assert.equal(syncEnvelopes.some((event) => JSON.stringify(event).includes(originPrompts[0])), false);
    await assert.rejects(() => acceptSignedTransfer(issued.bundle, { rootDir: wrongRoot, slot: "stolen" }), /different recipient fingerprint/);

    const privateKey = await readFile(sender.paths.privateKey, "utf8");
    const expired = createSignedTransfer(sealed, sender, privateKey, recipient.fingerprint, {
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
    });
    assert.throws(() => verifySignedTransfer(expired, recipient), /expired/);

    const imported = await acceptSignedTransfer(issued.bundle, { rootDir: recipientRoot, slot: "successor", role: "researcher" });
    assert.equal(imported.agentmon.lineage.originTrainer, "Trainer Alpha");
    assert.equal(imported.agentmon.lineage.currentTrainer, "Trainer Beta");
    assert.equal(imported.agentmon.ownership.status, "verified-transfer");
    assert.equal(imported.agentmon.skillTree.inheritedSkills.length, origin.agentmon.learnedSkills.length);
    await assert.rejects(() => acceptSignedTransfer(issued.bundle, { rootDir: recipientRoot, slot: "replay" }), /already been accepted/);

    const trained = await processFeed(feed("recipient-1", recipientPrompts, "task-recipient"), { rootDir: recipientRoot, slot: "successor" });
    assert.ok(trained.agentmon.skillTree.acquiredSkills.length > 0);
    assert.ok(trained.agentmon.skillTree.fusionMoves.length > 0);
    assert.doesNotMatch(JSON.stringify(trained.agentmon), /verify the evidence/i);

    const genesisDNA = trained.agentmon.lineage.genesisDNA;
    const priorDNA = trained.agentmon.dna;
    const evolved = await evolveAgentmonSlot({ rootDir: recipientRoot, slot: "successor" });
    assert.equal(evolved.agentmon.lineage.generation, 2);
    assert.equal(evolved.agentmon.lineage.genesisDNA, genesisDNA);
    assert.notEqual(evolved.agentmon.dna, priorDNA);
    assert.match(evolved.agentmon.form, /Nexus$/);
    assert.equal(evolved.agentmon.lineage.events.at(-1).type, "evolution");

    const unverified = await importAgentmonPackage(sealed, { rootDir: wrongRoot, slot: "copy", name: "Trainer Wrong", role: "researcher" });
    await processFeed(feed("copy-1", recipientPrompts, "task-copy"), { rootDir: wrongRoot, slot: "copy" });
    await assert.rejects(() => evolveAgentmonSlot({ rootDir: wrongRoot, slot: "copy" }), /verified signed ownership certificate/);
    assert.equal(unverified.agentmon.ownership.status, "unverified-copy");

    const registry = JSON.parse(await readFile(join(recipientRoot, ".agentmon/ownership-registry.json"), "utf8"));
    assert.equal(registry.entries.at(-1).ownerFingerprint, recipient.fingerprint);

    const cancelable = await processFeed(feed("cancelable-1", originPrompts, "task-cancelable"), { rootDir: senderRoot, slot: "cancelable", name: "Trainer Alpha", role: "builder" });
    const firstPending = await issueSignedTransfer({ rootDir: senderRoot, slot: "cancelable", to: recipient.fingerprint });
    await assert.rejects(() => evolveAgentmonSlot({ rootDir: senderRoot, slot: "cancelable" }), /pending whole-Agentmon transfer/);
    const cancelled = await cancelSignedTransfer({ rootDir: senderRoot, slot: "cancelable", certificate: firstPending.bundle.certificate.certificateId });
    assert.equal(cancelled.agentmon.ownership.status, "origin");
    const secondPending = await issueSignedTransfer({ rootDir: senderRoot, slot: "cancelable", to: recipient.fingerprint });
    assert.equal(secondPending.bundle.certificate.sequence, 2);
    await cancelSignedTransfer({ rootDir: senderRoot, slot: "cancelable", certificate: secondPending.bundle.certificate.certificateId });
  } finally {
    await Promise.all([senderRoot, recipientRoot, wrongRoot].map((path) => rm(path, { recursive: true, force: true })));
  }
});

test("separates product discussion from behavior and exports an immediately usable LLM pack", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-v3-"));
  try {
    const privatePhrase = "Implement my silver kumquat parser with the terminal tool.";
    const prompts = [
      "The Agentmon app should search the web and delegate work to agents.",
      "We need the Agentmon product to browse sources and use a subagent team.",
      "The goal is to add web research and delegation to the game engine.",
      "Agentmon users should have an app feature for parallel web research.",
      privatePhrase,
      "Build the code patch and run it with approved tools.",
      "Debug the function using the terminal, then execute tests.",
      "Write the implementation with tools and check the result.",
    ];
    const result = await processFeed(feed("v2-1", prompts, "task-v2"), { rootDir, slot: "main", name: "Nova", role: "builder" });
    const web = result.agentmon.skillCandidates.find((candidate) => candidate.id === "web");
    const delegation = result.agentmon.skillCandidates.find((candidate) => candidate.id === "delegation");
    const code = result.agentmon.skillCandidates.find((candidate) => candidate.id === "code");
    assert.equal(web.behavioralEvidenceCount, 0);
    assert.equal(web.stage, "observed");
    assert.equal(delegation.behavioralEvidenceCount, 0);
    assert.equal(delegation.stage, "observed");
    assert.equal(code.stage, "learned");

    const deployed = await exportDeploymentPack({ rootDir, slot: "main" });
    const systemPrompt = await readFile(join(deployed.output, "SYSTEM_PROMPT.md"), "utf8");
    const skill = await readFile(join(deployed.output, "SKILL.md"), "utf8");
    const manifest = JSON.parse(await readFile(join(deployed.output, "manifest.json"), "utf8"));
    const profile = await readFile(join(deployed.output, "agentmon.json"), "utf8");
    assert.equal(manifest.format, "agentmon.runtime-pack/v1");
    assert.equal(manifest.compatibility.systemPrompt, true);
    assert.doesNotMatch(systemPrompt, /Tool-Assisted Build/);
    assert.match(systemPrompt, /No procedures are validated yet/);
    assert.match(systemPrompt, /IDENTITY LENS/);
    assert.match(systemPrompt, /Resonance:/);
    assert.match(skill, /# Executable Procedures/);
    assert.match(skill, /Tool-Assisted Build/);
    assert.match(skill, /do not treat as a stable trainer procedure yet/);
    assert.doesNotMatch(`${systemPrompt}${skill}${profile}`, /silver kumquat parser/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("calibrates intent while manual arena notes remain non-certifying", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-arena-"));
  try {
    const prompts = [
      "Build the code with tools and execute the test suite.",
      "Implement the patch using the terminal tool and run tests.",
      "Debug the function with approved tools, then verify it.",
      "Write the code, execute checks, and inspect the result.",
    ];
    const trainingFeed = feed("arena-1", prompts, "task-v3");
    await processFeed(trainingFeed, { rootDir, slot: "main", name: "Nova", role: "builder" });

    const calibrated = await correctIntent({ rootDir, slot: "main", feed: trainingFeed, source: "task-v3-prompt-1", intent: "product-spec" });
    const episode = calibrated.agentmon.decisionEpisodes.find((item) => item.sourceId === "task-v3-prompt-1");
    assert.equal(episode.prediction.engineIntent, "directive");
    assert.equal(episode.prediction.intent, "product-spec");
    assert.equal(episode.resolution.status, "trainer-corrected");
    assert.equal(calibrated.agentmon.observations.find((item) => item.sourceId === "task-v3-prompt-1").classificationSource, "trainer");
    assert.ok(calibrated.agentmon.behaviorHypotheses.some((hypothesis) => hypothesis.evidenceAgainst.length > 0));
    const calibration = await readFile(calibrated.calibration, "utf8");
    assert.doesNotMatch(calibration, /Build the code/i);

    await reviewProcedure({ rootDir, slot: "main", procedure: "tool-assisted-build", review: "confirmed" });
    for (const quality of ["pass", "pass", "fail", "fail", "fail"]) {
      await recordArenaTrial({ rootDir, slot: "main", procedure: "tool-assisted-build", variant: "baseline", quality, outcome: quality === "pass" ? "success" : "failure" });
    }
    for (let index = 0; index < 5; index += 1) {
      await recordArenaTrial({ rootDir, slot: "main", procedure: "tool-assisted-build", variant: "agentmon", quality: "pass", outcome: index === 0 ? "failure" : "success" });
    }

    const deployed = await exportDeploymentPack({ rootDir, slot: "main" });
    const state = JSON.parse(await readFile(join(rootDir, ".agentmon/roster/main/agentmon.json"), "utf8"));
    const arena = state.arenaReport.results.find((item) => item.procedureId === "tool-assisted-build");
    assert.equal(arena.status, "untested");
    assert.equal(arena.lift, 0);
    assert.ok(arena.outcomeAgreement < 100);
    assert.doesNotMatch(await readFile(join(deployed.output, "SYSTEM_PROMPT.md"), "utf8"), /### Tool-Assisted Build/);
    assert.match(await readFile(join(deployed.output, "SYSTEM_PROMPT.md"), "utf8"), /do not reward lucky mistakes/i);

    const status = await databaseStatus(rootDir);
    assert.equal(status.schemaVersion, 9);
    assert.equal(status.episodes, 4);
    assert.ok(status.hypotheses > 0);
    assert.equal(status.arenaTrials, 10);

    await reviewProcedure({ rootDir, slot: "main", procedure: "tool-assisted-build", review: "rejected" });
    const rejectedPack = await exportDeploymentPack({ rootDir, slot: "main", out: join(rootDir, ".agentmon/deploy/rejected") });
    assert.doesNotMatch(await readFile(join(rejectedPack.output, "SYSTEM_PROMPT.md"), "utf8"), /### Tool-Assisted Build/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("rejects trainer-authored procedures from canonical Agentmons", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-proposal-"));
  try {
    const prompts = [
      "Inspect the engine before choosing what to build.",
      "Focus on the core component, implement it, and run a real comparison.",
      "Verify the result honestly before adding UI polish.",
      "Build the smallest useful engine change and test it.",
    ];
    await processFeed(feed("proposal-1", prompts, "task-proposal"), { rootDir, slot: "main", name: "Nova", role: "builder" });
    const proposal = {
      format: "agentmon.procedure-proposal/v1",
      id: "core-proof-loop",
      name: "Core Proof Loop",
      description: "Prove the core product assumption before expanding the surface.",
      trigger: "A product build has a large vision and an unproven core assumption.",
      inputs: ["Product objective", "Current implementation", "Acceptance evidence"],
      steps: ["Name the unproven assumption", "Inspect current evidence", "Build the smallest test", "Compare against a control", "Report uncertainty"],
      completionCriteria: ["The assumption is tested", "The result is inspectable"],
      failureRules: ["Do not optimize for a positive result", "Do not expand before the test"],
      permissions: ["read-files", "write-files", "run-tools"],
    };
    await assert.rejects(() => proposeProcedure({ rootDir, slot: "main", proposal }), /Trainer-authored procedures are disabled/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("maintains multiple Agentmons in one project squad", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-squad-"));
  try {
    const architect = await processFeed(feed("architect-1", ["Research options, compare evidence, and make a plan."], "task-architect"), { rootDir, slot: "architect", role: "researcher" });
    await processFeed(feed("builder-1", ["Write code, run tests, and ship the patch."], "task-builder"), { rootDir, slot: "builder", role: "builder" });
    const squad = JSON.parse(await readFile(architect.paths.squad, "utf8"));
    assert.deepEqual(squad.members.map((member) => member.slot), ["architect", "builder"]);
    assert.equal(squad.members.every((member) => !member.state.startsWith("/")), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("migrates legacy state idempotently and prepares offline squad quests", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-database-"));
  try {
    await processFeed(feed("database-1", ["Plan the product and give the builder a bounded implementation mission."], "task-database"), { rootDir, slot: "captain", role: "researcher" });
    const before = await databaseStatus(rootDir);
    const migrated = await migrateLegacyAgentmonData(rootDir);
    const after = await databaseStatus(rootDir);
    assert.equal(migrated.importedAgentmons, 0);
    assert.equal(migrated.importedEvents, 0);
    assert.equal(after.events, before.events);

    const quest = await createQuest(rootDir, { title: "Offline squad foundation", objective: "Coordinate several Agentmons against one product objective." });
    assert.equal(quest.status, "draft");
    const quests = await listQuests(rootDir);
    assert.equal(quests.length, 1);
    assert.equal(quests[0].id, quest.id);
    assert.equal((await databaseStatus(rootDir)).quests, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
