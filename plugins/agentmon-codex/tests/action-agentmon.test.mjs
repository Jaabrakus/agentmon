import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { actionDigest, deterministicResonance, validateActionEvent } from "../lib/actions/action-contract.mjs";
import { authorizeAction, deriveActionSkills, reviewActionSkill, simulateActionSkill } from "../lib/actions/action-skill-engine.mjs";
import { forecastNextAction } from "../lib/actions/poker-forecast.mjs";
import { selectLifeMove } from "../lib/actions/life-strategy.mjs";
import { declareActionEmotion, readActionLearningStatus, recordActionEvent, reviewActionProposal } from "../lib/runtime/action-learning-service.mjs";
import { startDesktopBrowserServer } from "../desktop-app/desktop-browser-server.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function event(session, index, control, overrides = {}) {
  return validateActionEvent({
    id: `${session}-${index}`,
    session,
    site: "example.test",
    routeDigest: actionDigest(`/private/route/${session}/${index}`),
    pageClass: index === 0 ? "project" : "form",
    kind: control === "submit" ? "form-submit" : "control",
    control,
    observedAt: `2026-07-27T12:${String(Number(session.slice(-1)) * 10 + index).padStart(2, "0")}:00.000Z`,
    ...overrides,
  });
}

function repeatedEvents(finalControl = "submit") {
  return ["session-1", "session-2", "session-3"].flatMap((session) => [
    event(session, 0, "open"),
    event(session, 1, "edit"),
    event(session, 2, finalControl),
  ]);
}

function agentmon() {
  return {
    id: "AGM-ACTION-1",
    dna: "ACTIONDNA",
    species: "Guardot",
    promptprint: { archetype: "Systems Pathfinder" },
    lineage: { genesisDNA: "ACTION-GENESIS" },
  };
}

test("binds resonance to each Agentmon's own hatch DNA instead of a global default", () => {
  const variants = Array.from({ length: 24 }, (_, index) => deterministicResonance({
    id: `AGM-UNIQUE-${index}`,
    promptprint: { archetype: "Systems Pathfinder" },
    lineage: { genesisDNA: `UNIQUE-DNA-${index}` },
  }));
  assert.ok(new Set(variants).size >= 3);
  assert.equal(deterministicResonance(agentmon()), deterministicResonance(agentmon()));
});

test("accepts only finite semantic events and rejects raw website data", () => {
  const safe = event("session-1", 0, "open");
  assert.equal(safe.privacy.fieldValuesStored, false);
  assert.equal(safe.routeDigest.length, 64);
  assert.throws(() => validateActionEvent({ ...safe, id: "unsafe", value: "secret" }), /may not contain action.value/);
  assert.throws(() => validateActionEvent({ ...safe, id: "unsafe", screenshot: "bytes" }), /may not contain action.screenshot/);
  assert.throws(() => validateActionEvent({ ...safe, id: "unsafe", selector: "#customer-name" }), /may not contain action.selector/);
});

test("derives an inspectable Action Skill only after three distinct sessions", () => {
  assert.equal(deriveActionSkills(agentmon(), repeatedEvents().slice(0, 6), { resonance: "counterpart" }).length, 0);
  const [skill] = deriveActionSkills(agentmon(), repeatedEvents(), { resonance: "counterpart", now: "2026-07-27T13:00:00.000Z" });
  assert.equal(skill.format, "agentmon.action-skill/v1");
  assert.equal(skill.resonance, "counterpart");
  assert.equal(skill.evidence.distinctSessions, 3);
  assert.ok(skill.steps.some((step) => step.kind === "checkpoint"));
  assert.equal(skill.privacy.rawTextStored, false);
  assert.equal(skill.executionPolicy.automaticRiskCeiling, "none");
});

test("uses poker discipline to fold when relationship evidence is negative or consent is unclear", () => {
  const rows = repeatedEvents("send");
  const openKey = "example.test:form:control:edit";
  const sendKey = "example.test:form:control:send";
  const forecast = forecastNextAction(rows, { currentActionKey: openKey, relationshipStakes: "high", consent: "unclear" }, [
    { actionKey: sendKey, score: 60, relationshipScore: -80, optionalityScore: -70 },
  ]);
  assert.equal(forecast.decision, "fold");
  assert.equal(forecast.outcomeSeparatedFromDecision, true);
  assert.match(forecast.relationship.policy, /never infer hidden emotions/);
  assert.ok(forecast.unknown.some((item) => item.includes("private thoughts")));
  assert.equal(forecast.lifeMove.move, "fold");
});

test("maps Life Moves to declared emotion without turning emotion into evidence", () => {
  const forecast = forecastNextAction(repeatedEvents("save"), { currentActionKey: "example.test:project:control:open", emotionState: "frustrated", emotionIntensity: 4, emotionSource: "trainer-declared" });
  assert.equal(forecast.lifeMove.move, "stay");
  assert.match(forecast.lifeMove.emotion.policy, /never evidence/);
  const hiddenGuess = selectLifeMove(forecast, { emotionState: "anxious", emotionSource: "model-inferred" });
  assert.equal(hiddenGuess.emotion.state, "neutral");
  const blockedBluff = selectLifeMove(forecast, { requestedMove: "bluff", domain: "relationship", bluffAuthorized: true });
  assert.equal(blockedBluff.move, "check");
  assert.equal(blockedBluff.allowed, false);
  const gameBluff = selectLifeMove(forecast, { requestedMove: "bluff", domain: "game", bluffAuthorized: true });
  assert.equal(gameBluff.move, "bluff");
  assert.equal(gameBluff.allowed, true);
  assert.equal(selectLifeMove(forecast, { requestedMove: "all-in" }).allowed, false);
});

test("simulation never executes and only a proven Operator may auto-run low-risk actions", () => {
  const [proposal] = deriveActionSkills(agentmon(), repeatedEvents("save"), { resonance: "operator" });
  const approved = reviewActionSkill(proposal, "confirmed");
  const simulation = simulateActionSkill(approved, { grantedSites: ["example.test"] });
  assert.equal(simulation.executable, false);
  assert.ok(simulation.steps.every((step) => ["preview", "ask"].includes(step.decision)));
  assert.equal(authorizeAction(approved, { site: "example.test", control: "open", risk: "low", grantedSites: ["example.test"], arenaProven: true }).decision, "ask");
  const proven = { ...approved, status: "proven" };
  assert.equal(authorizeAction(proven, { site: "example.test", control: "open", risk: "low", grantedSites: ["example.test"], arenaProven: true }).decision, "allow");
  assert.equal(authorizeAction(proven, { site: "example.test", control: "save", risk: "medium", grantedSites: ["example.test"], arenaProven: true }).decision, "ask");
});

test("persists raw-free Action learning locally with a DNA-bound resonance", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-actions-"));
  const roster = join(rootDir, ".agentmon/roster/main");
  await mkdir(roster, { recursive: true });
  await writeFile(join(roster, "agentmon.json"), `${JSON.stringify(agentmon())}\n`);
  await declareActionEmotion({ rootDir, slot: "main", input: { state: "frustrated", intensity: 4 }, now: "2026-07-27T12:00:00.000Z" });
  for (const row of repeatedEvents("save")) await recordActionEvent({ rootDir, slot: "main", input: row, now: row.observedAt });
  const status = await readActionLearningStatus({ rootDir, slot: "main" });
  assert.equal(status.observedEvents, 9);
  assert.ok(status.proposed >= 1);
  assert.equal(status.resonance, deterministicResonance(agentmon()));
  assert.equal(status.resonanceBinding.length, 64);
  assert.deepEqual({ state: status.trainerState.state, intensity: status.trainerState.intensity, source: status.trainerState.source }, { state: "frustrated", intensity: 4, source: "trainer-declared" });
  assert.equal(status.skills[0].forecast.lifeMove.move, "stay");
  const reviewed = await reviewActionProposal({ rootDir, slot: "main", actionSkillId: status.skills[0].id, review: "confirmed" });
  assert.equal(reviewed.skill.status, "approved");
  const artifact = await readFile(join(roster, "action-learning.json"), "utf8");
  assert.doesNotMatch(artifact, /private\/route|secret|"screenshot"|"selector"/);
  assert.match(artifact, /"rawTextStored": false/);
  const skillMarkdown = await readFile(join(roster, "action-skills/SKILL.md"), "utf8");
  assert.match(skillMarkdown, /name: agentmon-actions/);
  assert.match(skillMarkdown, /Current battle state: \*\*frustrated 4\/5\*\*/);
  assert.doesNotMatch(skillMarkdown, /private\/route|secret/);
  await rm(rootDir, { recursive: true, force: true });
});

test("desktop action API requires opt-in and stores only trainer-declared battle state plus semantic events", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-action-api-"));
  const roster = join(rootDir, ".agentmon/roster/main");
  await mkdir(roster, { recursive: true });
  await writeFile(join(roster, "agentmon.json"), `${JSON.stringify(agentmon())}\n`);
  const origin = "chrome-extension://actiontest";
  const server = await startDesktopBrowserServer({ rootDir, engineRoot: projectRoot, port: 0, pairingCode: "ACTION-PAIR" });
  const endpoint = `http://127.0.0.1:${server.port}`;
  try {
    const pair = await (await fetch(`${endpoint}/v1/browser/pair`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ code: "ACTION-PAIR" }) })).json();
    const headers = { Origin: origin, Authorization: `Bearer ${pair.token}`, "Content-Type": "application/json" };
    await fetch(`${endpoint}/v1/browser/site-state`, { method: "POST", headers, body: JSON.stringify({ site: "example.test", enabled: true }) });
    const denied = await fetch(`${endpoint}/v1/browser/actions/event`, { method: "POST", headers, body: JSON.stringify({ site: "example.test", event: event("session-1", 0, "open") }) });
    assert.equal(denied.status, 400);
    const mode = await fetch(`${endpoint}/v1/browser/actions/mode`, { method: "POST", headers, body: JSON.stringify({ site: "example.test", enabled: true, slot: "main" }) });
    assert.equal(mode.status, 200);
    const emotion = await (await fetch(`${endpoint}/v1/browser/actions/emotion`, { method: "POST", headers, body: JSON.stringify({ site: "example.test", state: "anxious", intensity: 5, slot: "main" }) })).json();
    assert.equal(emotion.trainerState.state, "anxious");
    assert.equal(emotion.trainerState.intensity, 5);
    const unsafe = await fetch(`${endpoint}/v1/browser/actions/event`, { method: "POST", headers, body: JSON.stringify({ site: "example.test", event: { ...event("session-1", 0, "open"), value: "API-RAW-SECRET" } }) });
    assert.equal(unsafe.status, 400);
    for (const row of repeatedEvents("save")) {
      const accepted = await fetch(`${endpoint}/v1/browser/actions/event`, { method: "POST", headers, body: JSON.stringify({ site: "example.test", slot: "main", event: row }) });
      assert.equal(accepted.status, 200);
    }
    const status = await (await fetch(`${endpoint}/v1/browser/actions/status?slot=main&site=example.test`, { headers })).json();
    assert.equal(status.enabled, true);
    assert.equal(status.status.trainerState.source, "trainer-declared");
    assert.equal(status.status.skills[0].forecast.lifeMove.move, "stay");
    const artifacts = `${await readFile(join(roster, "action-learning.json"), "utf8")}\n${await readFile(join(roster, "action-skills/SKILL.md"), "utf8")}`;
    assert.doesNotMatch(artifacts, /API-RAW-SECRET/);
  } finally {
    await server.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});
