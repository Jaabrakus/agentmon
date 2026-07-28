import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const prototypeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(prototypeRoot, "..");
const bridge = resolve(prototypeRoot, "src-tauri/scripts/downlink-bridge.mjs");

function runBridge(command, input = "") {
  return JSON.parse(execFileSync("node", [bridge, command, projectRoot], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

test("loads the real complete Guardot identity without sending data", () => {
  const startedAt = Date.now();
  const result = runBridge("identity");
  assert.ok(Date.now() - startedAt < 5000, "identity loading must not initialize the heavy SQLite/arena runtime");
  assert.equal(result.agentmon.id, "AGM-70EC-9099");
  assert.equal(result.identity.permanentArchetype, "EXACT GEARSMITH");
  assert.equal(result.identity.resonance.mode, "mentor");
  assert.ok(result.identity.workingProfile.patterns.length > 0);
  assert.ok(result.identity.capabilities.some((item) => item.name === "Code Burst"));
  assert.equal(result.summary.identity.species, "Vault Tortoise");
  assert.equal(result.summary.hatch.score, 100);
  assert.equal(result.summary.lineage.currentDNA, "70EC9099");
  assert.ok(result.summary.capabilities.some((item) => item.name === "Pixel Sight"));
  assert.ok(result.summary.procedures.some((item) => item.name === "Core Proof Loop" && item.arenaStatus === "proven"));
  assert.equal(result.summary.arena.results[0].lift, 20);
  assert.equal(result.privacy.sentToActiveModelProvider, false);
  assert.match(result.skillMarkdown, /# Guardot Agentmon/);
  assert.match(result.skillMarkdown, /Hatch-locked resonance \(individual\): MENTOR/);
  assert.match(result.skillMarkdown, /Resonance posture: suggest-only; adds a checkpoint/);
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

test("does not force an unrelated task through Core Proof Loop", () => {
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
