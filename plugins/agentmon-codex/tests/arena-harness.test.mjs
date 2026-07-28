import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createCodexCliArenaProvider,
  createOpenAICompatibleArenaProvider,
  runArenaSuite,
  validateArenaSuite,
} from "../lib/arena-harness.mjs";
import { processFeed } from "../scripts/agentmon.mjs";
import { databaseStatus, openAgentmonDatabase, persistArenaRun } from "../scripts/agentmon-db.mjs";

function trainingFeed(prompts) {
  return {
    format: "agentmon.feed/v1",
    source: "test",
    revision: "arena-training-1",
    generatedAt: new Date().toISOString(),
    consent: { scope: "user_prompts_only" },
    thread: { id: "arena-training", label: "Arena training" },
    prompts: prompts.map((text, index) => ({ id: `prompt-${index + 1}`, text, chars: text.length, redactions: 0 })),
    totals: { prompts: prompts.length, characters: prompts.reduce((sum, text) => sum + text.length, 0), redactions: 0 },
  };
}

function deterministicSuite(privatePhrase = "private benchmark phrase") {
  return {
    format: "agentmon.arena-suite/v1",
    id: "scripted-foundations",
    version: 1,
    genericControl: { id: "generic-checklist", version: 1, instructions: "Verify the result." },
    tasks: Array.from({ length: 5 }, (_, index) => ({
      id: `task-${index + 1}`,
      prompt: `${privatePhrase} ${index + 1}`,
      rubric: { passThreshold: 70, checks: [{ type: "includes", value: "verified", weight: 1 }, { type: "includes", value: "structured", weight: 1 }] },
    })),
  };
}

test("runs locked paired trials and proves a useful procedure", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-auto-arena-"));
  try {
    const prompts = [
      "Build code with tools and execute the test suite.",
      "Implement the patch using the terminal and run tests.",
      "Debug the function with approved tools, then verify it.",
      "Write the code, execute checks, and inspect the result.",
    ];
    const trained = await processFeed(trainingFeed(prompts), { rootDir, slot: "main", name: "Nova", role: "builder" });
    assert.ok(trained.agentmon.proceduralSkills.some((procedure) => procedure.id === "tool-assisted-build"));

    const calls = [];
    const contestant = {
      descriptor: { kind: "scripted-test", model: "fixed" },
      generate: async (input) => {
        calls.push(input);
        if (input.variant === "agentmon") return "verified structured result";
        if (input.variant === "generic") return "verified result";
        return "unfinished response";
      },
    };
    const suite = deterministicSuite("DO NOT PERSIST THIS BENCHMARK");
    const result = await runArenaSuite({
      suite,
      agentmon: trained.agentmon,
      procedureId: "tool-assisted-build",
      contestant,
      repetitions: 1,
      seed: "locked-seed",
    });

    assert.equal(calls.length, 15);
    assert.equal(new Set(calls.map((call) => JSON.stringify(call.lockedConfig))).size, 1);
    for (const task of suite.tasks) {
      const pair = calls.filter((call) => call.task === task.prompt);
      assert.deepEqual(new Set(pair.map((call) => call.variant)), new Set(["baseline", "generic", "agentmon"]));
      assert.equal(pair[0].lockedConfig, pair[2].lockedConfig);
    }
    assert.equal(result.run.summary.baseline.averageScore, 0);
    assert.equal(result.run.summary.generic.averageScore, 50);
    assert.equal(result.run.summary.agentmon.averageScore, 100);
    assert.equal(result.run.summary.averageScoreLift, 100);
    assert.equal(result.run.summary.personalization.status, "personalized");
    assert.equal(result.run.summary.personalization.averageScoreLiftVsGeneric, 50);
    assert.equal(result.agentmon.arenaReport.results.find((item) => item.procedureId === "tool-assisted-build").status, "proven");
    assert.equal(result.run.artifacts[0].prompt.includes("DO NOT PERSIST"), true);

    await persistArenaRun(rootDir, result.run);
    assert.equal((await databaseStatus(rootDir)).arenaRuns, 1);
    const store = openAgentmonDatabase(rootDir);
    const stored = JSON.stringify({
      runs: store.db.prepare("SELECT * FROM arena_runs").all(),
      tasks: store.db.prepare("SELECT * FROM arena_task_results").all(),
    });
    store.db.close();
    assert.equal(JSON.parse(stored).tasks.length, 5);
    assert.doesNotMatch(stored, /DO NOT PERSIST THIS BENCHMARK/);
    assert.doesNotMatch(stored, /unfinished response/);
    assert.doesNotMatch(stored, /verified result/);
    assert.match(stored, /"generic_score":50/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("keeps judge identities blind and rejects unsafe or malformed configurations", async () => {
  const procedure = {
    id: "careful-work",
    name: "Careful Work",
    trigger: "A task needs care",
    inputs: ["task"],
    steps: ["Inspect", "Verify"],
    completionCriteria: ["Evidence checked"],
    failureRules: ["Do not invent evidence"],
    permissions: ["read-files"],
    trainerReview: "confirmed",
  };
  const agentmon = { id: "AGM-TEST", proceduralSkills: [procedure], procedureTrials: [] };
  let judgeInput;
  const result = await runArenaSuite({
    suite: {
      format: "agentmon.arena-suite/v1",
      id: "blind-suite",
      version: 1,
      tasks: [{ id: "blind-task", prompt: "Choose the stronger answer", rubric: {} }],
    },
    agentmon,
    procedureId: procedure.id,
    contestant: {
      descriptor: { kind: "scripted" },
      generate: async ({ variant }) => variant === "agentmon" ? "strong" : "weak",
    },
    judge: {
      descriptor: { kind: "blind-scripted" },
      compare: async (input) => {
        judgeInput = input;
        return { scores: { A: input.candidates.A === "strong" ? 95 : 10, B: input.candidates.B === "strong" ? 95 : 10 } };
      },
    },
    seed: "blind-seed",
  });
  assert.deepEqual(Object.keys(judgeInput.candidates), ["A", "B"]);
  assert.equal("variant" in judgeInput, false);
  assert.equal(result.run.summary.agentmon.averageScore, 95);
  assert.equal(result.run.summary.baseline.averageScore, 10);

  assert.throws(() => createOpenAICompatibleArenaProvider({ baseUrl: "https://models.example.com/v1", model: "unsafe" }), /loopback only/);
  assert.throws(() => validateArenaSuite({ ...deterministicSuite(), tasks: [{ id: "bad", prompt: "x", rubric: { checks: [{ type: "includes", value: "", weight: 1 }] } }] }), /non-empty string/);
  await assert.rejects(() => runArenaSuite({
    suite: deterministicSuite(),
    agentmon: { ...agentmon, proceduralSkills: [{ ...procedure, trainerReview: "rejected" }] },
    procedureId: procedure.id,
    contestant: { generate: async () => "text" },
  }), /Rejected procedures/);
});

test("adapts read-only Codex CLI responses for contestants and blind judges", async () => {
  const prompts = [];
  const provider = createCodexCliArenaProvider({
    cwd: process.cwd(),
    model: "codex-test",
    reasoningEffort: "low",
    runner: async (prompt) => {
      prompts.push(prompt);
      return prompt.includes("blind Agentmon arena judge") ? '```json\n{"scores":{"A":"82","B":61,"C":73}}\n```' : "bounded recommendation";
    },
  });
  assert.equal(provider.descriptor.kind, "codex-cli");
  assert.equal(provider.descriptor.sandbox, "read-only");
  assert.equal(provider.descriptor.approval, "never");
  assert.equal(await provider.generate({ task: "Choose the next milestone", systemPrompt: "Use repository evidence." }), "bounded recommendation");
  assert.deepEqual(await provider.compare({ task: "Choose", rubric: {}, candidates: { A: "one", B: "two", C: "three" } }), { scores: { A: 82, B: 61, C: 73 } });
  assert.match(prompts[0], /Do not modify files/);
  assert.doesNotMatch(prompts[1], /baseline|agentmon procedure/i);
});
