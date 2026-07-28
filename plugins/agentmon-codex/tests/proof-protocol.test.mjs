import assert from "node:assert/strict";
import test from "node:test";
import {
  addHeldoutTask,
  buildPrivateArenaSuite,
  createProofExperiment,
  proofReadiness,
} from "../lib/proof-protocol.mjs";

function agentmon(review = "confirmed") {
  return {
    id: "AGM-PROOF",
    proceduralSkills: [{
      id: "core-proof-loop",
      name: "Core Proof Loop",
      trigger: "A product vision needs a credible next proof",
      inputs: ["objective", "repository evidence"],
      steps: ["State the assumption", "Inspect evidence", "Run the smallest proof"],
      completionCriteria: ["Decision follows from evidence"],
      failureRules: ["Do not game the benchmark"],
      permissions: ["read-files"],
      trainerReview: review,
      provenance: { kind: "trainer-proposal", version: 1 },
    }],
  };
}

function feed(privatePhrase) {
  return {
    format: "agentmon.feed/v1",
    revision: "cutoff-revision",
    consent: { scope: "user_prompts_only" },
    prompts: [{ id: "p1", text: privatePhrase }],
  };
}

function task(id, prompt, createdAt) {
  return {
    format: "agentmon.heldout-task/v1",
    id,
    createdAt,
    source: `prospective-${id}`,
    prompt,
    eligibility: {
      naturallyOccurring: true,
      independentRubric: true,
      readOnly: true,
      multiplePlausibleActions: true,
      consentedForEvaluation: true,
    },
    rubric: {
      passThreshold: 78,
      criteria: ["Uses repository facts", "Makes one bounded recommendation", "Defines risks and verification"],
    },
  };
}

test("freezes a raw-free proof cutoff and requires trainer confirmation", () => {
  const privatePhrase = "private cobalt launch workflow";
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const proof = createProofExperiment({ agentmon: agentmon(), procedureId: "core-proof-loop", feed: feed(privatePhrase), now: cutoff });
  assert.equal(proof.status, "collecting");
  assert.equal(proof.trainingCutoff.promptCount, 1);
  assert.equal(proof.trainingCutoff.rawPromptTextStored, false);
  assert.doesNotMatch(JSON.stringify(proof), /private cobalt launch workflow/);
  assert.throws(() => createProofExperiment({ agentmon: agentmon("unreviewed"), procedureId: "core-proof-loop", feed: feed(privatePhrase), now: cutoff }), /trainer-confirmed/);
});

test("enrolls only prospective uncontaminated tasks and builds an integrity-checked private suite", () => {
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  const afterCutoff = new Date(Date.now() - 60_000).toISOString();
  let proof = createProofExperiment({ agentmon: agentmon(), procedureId: "core-proof-loop", feed: feed("Design the cobalt launch workflow from repository evidence"), now: cutoff, targetTasks: 5, minimumTasks: 5 });
  const privateTasks = [];
  const prompts = [
    "Choose one bounded release decision for the parser using its failing integration tests and identify a rollback gate.",
    "Decide whether the local database migration should ship after inspecting compatibility fixtures and define a recovery check.",
    "Recommend whether to refactor the collector now or defer it based on latency traces and error reports.",
    "Select the smallest authentication hardening change justified by the daemon threat model and specify validation evidence.",
    "Determine whether the plugin package is ready to distribute using manifest validation and archive integrity results.",
  ];
  for (let index = 1; index <= 5; index += 1) {
    const enrolled = addHeldoutTask(proof, task(`decision-${index}`, prompts[index - 1], afterCutoff), {
      trainingPrompts: ["Design the cobalt launch workflow from repository evidence"],
      developmentPrompts: ["Plan a seven day benchmark for a creature engine"],
      existingPrompts: privateTasks.map((item) => item.prompt),
      now: afterCutoff,
    });
    proof = enrolled.experiment;
    privateTasks.push(enrolled.privateTask);
  }
  assert.equal(proof.status, "ready");
  assert.equal(proofReadiness(proof).fullTargetReached, true);
  const suite = buildPrivateArenaSuite(proof, privateTasks);
  assert.equal(suite.tasks.length, 5);
  assert.equal(suite.genericControl.id, "matched-generic-product-engineering");

  const tampered = structuredClone(privateTasks);
  tampered[0].prompt = "Changed after enrollment";
  assert.throws(() => buildPrivateArenaSuite(proof, tampered), /integrity failed/);
});

test("rejects pre-cutoff, treatment-revealing, exact, and near-duplicate tasks", () => {
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  const afterCutoff = new Date(Date.now() - 60_000).toISOString();
  const beforeCutoff = new Date(Date.now() - 180_000).toISOString();
  const training = "Choose the safest release plan using current repository tests and define the rollback gate";
  const proof = createProofExperiment({ agentmon: agentmon(), procedureId: "core-proof-loop", feed: feed(training), now: cutoff });
  assert.throws(() => addHeldoutTask(proof, task("old", "Choose a bounded database migration plan with rollback checks.", beforeCutoff)), /after the frozen training cutoff/);
  assert.throws(() => addHeldoutTask(proof, task("revealed", "Test whether Agentmon passes the personalization proof.", afterCutoff)), /reveals the treatment/);
  assert.throws(() => addHeldoutTask(proof, task("exact", training, afterCutoff), { trainingPrompts: [training] }), /exactly matches/);
  assert.throws(() => addHeldoutTask(proof, task("near", "Choose the safest release plan using current repository tests and define one rollback gate", afterCutoff), { trainingPrompts: [training] }), /too similar/);
});
