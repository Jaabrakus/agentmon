import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const prototypeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(prototypeRoot, "..");
const bridge = resolve(prototypeRoot, "src-tauri/scripts/downlink-bridge.mjs");
let habitatRoot;

before(async () => {
  habitatRoot = await mkdtemp(join(tmpdir(), "agentmon-downlink-test-"));
  const roster = resolve(habitatRoot, ".agentmon/roster/main");
  await mkdir(resolve(roster, "visual"), { recursive: true });
  await writeFile(resolve(roster, "SKILL.md"), [
    "# Fixture Agentmon",
    "",
    "Synthetic derived identity used only by the clean-runner test suite.",
    "",
    "# Complete Identity Contract",
  ].join("\n"));
  await writeFile(resolve(roster, "agentmon.json"), `${JSON.stringify({
    creationVersion: "test-fixture/v1",
    id: "AGM-CI-FIXTURE",
    species: "Fixture Tortoise",
    form: "Fixture Guardot",
    nature: "Steady",
    dna: "fixture-dna",
    hatchReadiness: { score: 100 },
    promptprint: {
      archetype: "GUARDIAN FIXTURE",
      confidence: 88,
      sampleCount: 8,
      dimensions: { structure: 80, precision: 72, verification: 84 },
    },
    growthPromptprint: {
      archetype: "GUARDIAN FIXTURE",
      confidence: 90,
      sampleCount: 12,
      dimensions: { structure: 82, precision: 76, verification: 88 },
    },
    lineage: {
      generation: 1,
      genesisDNA: "fixture-dna",
      currentDNA: "fixture-dna",
    },
    learnedSkills: [{
      id: "fixture-code",
      name: "Fixture Code Burst",
      type: "craft",
      power: 72,
      description: "A synthetic evidence-backed coding tendency.",
      evidence: 4,
      source: "synthetic-test-evidence",
    }],
    skillCandidates: [{
      id: "fixture-code",
      name: "Fixture Code Burst",
      stage: "validated",
      confidence: 91,
      behavioralEvidenceCount: 4,
      reason: "Synthetic evidence for deterministic identity compilation.",
    }],
    proceduralSkills: [{
      id: "fixture-untrusted-procedure",
      name: "Untrusted Fixture Loop",
      stage: "validated",
      confidence: 99,
      trainerConfirmed: true,
      trainerReview: "confirmed",
      provenance: { kind: "trainer-authored" },
      trigger: "Any task",
      steps: ["Do not execute this noncanonical fixture."],
      completionCriteria: ["Never selected"],
      failureRules: [],
      permissions: [],
    }],
    procedureTrials: [],
    arenaReport: {
      testedProcedures: 1,
      provenProcedures: 1,
      results: [{
        procedureId: "fixture-untrusted-procedure",
        status: "proven",
        lift: 20,
      }],
    },
  }, null, 2)}\n`);
});

after(async () => {
  if (habitatRoot) await rm(habitatRoot, { recursive: true, force: true });
});

function runBridge(command, input = "") {
  return JSON.parse(execFileSync("node", [bridge, command, habitatRoot, projectRoot], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

test("loads a complete derived identity without sending data", () => {
  const startedAt = Date.now();
  const result = runBridge("identity");
  assert.ok(Date.now() - startedAt < 5000, "identity loading must not initialize the heavy SQLite/arena runtime");
  assert.equal(result.agentmon.id, "AGM-CI-FIXTURE");
  assert.equal(result.identity.permanentArchetype, "GUARDIAN FIXTURE");
  assert.equal(result.identity.resonance.mode, "guardian");
  assert.ok(result.identity.workingProfile.patterns.length > 0);
  assert.ok(result.identity.capabilities.some((item) => item.name === "Fixture Code Burst"));
  assert.equal(result.summary.identity.species, "Fixture Tortoise");
  assert.equal(result.summary.hatch.score, 100);
  assert.equal(result.summary.lineage.currentDNA, "fixture-dna");
  assert.ok(result.summary.capabilities.some((item) => item.name === "Fixture Code Burst"));
  assert.ok(result.summary.procedures.some((item) => item.name === "Untrusted Fixture Loop" && item.arenaStatus === "proven"));
  assert.equal(result.summary.arena.results[0].lift, 20);
  assert.equal(result.privacy.sentToActiveModelProvider, false);
  assert.match(result.skillMarkdown, /# Fixture Agentmon/);
  assert.match(result.skillMarkdown, /# Complete Identity Contract/);
});

test("refuses a noncanonical procedure even when legacy arena evidence says proven", () => {
  const result = runBridge("compile", "Decide the next product milestone and test whether Agentmon provides real value.");
  assert.deepEqual(result.procedures, []);
  assert.equal(result.routing.decision, "identity-only");
  assert.equal(result.delivery.status, "compiled-not-sent");
  assert.equal(result.privacy.rawPromptsStored, false);
  assert.equal(result.privacy.sentToActiveModelProvider, false);
  assert.equal(JSON.stringify(result).includes("Decide the next product milestone"), false);
});

test("does not force an unrelated task through an untrusted procedure", () => {
  const result = runBridge("compile", "Write a birthday poem.");
  assert.deepEqual(result.procedures, []);
  assert.equal(result.routing.decision, "identity-only");
  assert.match(result.packet, /identity lens only/i);
});

test("keeps the Rubik's teaching benchmark identity-only", () => {
  const result = runBridge("compile", "Teach a visual beginner the white cross on a 3x3 Rubik's Cube, including side-center verification.");
  assert.deepEqual(result.procedures, []);
  assert.equal(result.routing.decision, "identity-only");
  assert.equal(JSON.stringify(result).includes("side-center verification"), false);
});
