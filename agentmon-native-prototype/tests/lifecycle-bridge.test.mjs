import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const prototypeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineRoot = resolve(prototypeRoot, "..");
const bridge = resolve(prototypeRoot, "src-tauri/scripts/lifecycle-bridge.mjs");

function run(command, rootDir, input = {}) {
  return JSON.parse(execFileSync("node", [bridge, command, rootDir, engineRoot], {
    input: JSON.stringify(input),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

test("hatches and trains through a raw-free, DNA-sealed desktop lifecycle", async () => {
  const rootDir = await mkdtemp(resolve(tmpdir(), "agentmon-native-lifecycle-"));
  const privatePhrase = "Build my obsidian lighthouse compiler, verify every result, and retry failed tests.";
  try {
    const empty = run("status", rootDir);
    assert.equal(empty.hasAgentmon, false);
    assert.equal(empty.stage.key, "signal");
    assert.equal(empty.level.level, 0);

    const first = run("train", rootDir, {
      trainerName: "Prototype Trainer",
      role: "builder",
      prompts: [
        privatePhrase,
        "Use approved tools to implement the smallest complete patch and run its tests.",
        "Challenge weak assumptions with evidence before committing to the implementation.",
        "Plan the milestones, execute the code, inspect the output, and correct failures.",
        "Keep the user goal visible while delegating independent research and review tasks.",
      ],
    });
    assert.equal(first.action, "hatched");
    assert.equal(first.hasAgentmon, true);
    assert.ok(first.identity.dna);
    assert.ok(first.level.level > 0);
    assert.equal(first.integrity.rawPromptsStored, false);
    assert.equal(first.integrity.dnaMutableByTraining, false);

    const originalDna = first.identity.dna;
    const trained = run("train", rootDir, {
      trainerName: "Prototype Trainer",
      role: "builder",
      prompts: ["Implement another bounded change, run the quality gate, and report concrete evidence."],
    });
    assert.equal(trained.action, "trained");
    assert.equal(trained.identity.dna, originalDna);
    assert.ok(trained.evidence.sourceCount > first.evidence.sourceCount);

    const state = await readFile(resolve(rootDir, ".agentmon/roster/main/agentmon.json"), "utf8");
    const ledger = await readFile(resolve(rootDir, ".agentmon/roster/main/learning-ledger.json"), "utf8");
    const skill = await readFile(resolve(rootDir, ".agentmon/roster/main/SKILL.md"), "utf8");
    assert.doesNotMatch(state, /obsidian lighthouse compiler/i);
    assert.doesNotMatch(ledger, /obsidian lighthouse compiler/i);
    assert.doesNotMatch(skill, /obsidian lighthouse compiler/i);

    assert.throws(() => run("evolve", rootDir), /inherited skill branch|fusion move/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
