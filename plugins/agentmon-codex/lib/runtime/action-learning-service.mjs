import { actionDigest, deterministicResonance, validateActionEvent, validateTrainerEmotion } from "../actions/action-contract.mjs";
import { deriveActionSkills, reviewActionSkill, simulateActionSkill } from "../actions/action-skill-engine.mjs";
import { atomicWrite, pathsFor, readAgentmonState, readJson, safeSlot, writeJson } from "./storage.mjs";

export const ACTION_LEARNING_FORMAT = "agentmon.action-learning/v1";
const MAX_EVENTS = 1_000;
const MAX_OUTCOMES = 500;

function blankActionState(agentmon, resonance, now) {
  const genesisDNA = agentmon?.lineage?.genesisDNA || agentmon?.dna || agentmon?.id || "unbound";
  return {
    format: ACTION_LEARNING_FORMAT,
    agentmonId: agentmon?.id || null,
    resonance,
    resonanceBinding: actionDigest(`${genesisDNA}:${resonance}`),
    events: [],
    actionSkills: [],
    outcomes: [],
    trainerState: validateTrainerEmotion(),
    updatedAt: now,
    privacy: {
      localOnly: true,
      rawTextStored: false,
      fieldValuesStored: false,
      screenshotsStored: false,
      keystrokesStored: false,
      credentialsStored: false,
    },
  };
}

function mergeReviews(proposals, existing) {
  const byId = new Map(existing.map((skill) => [skill.id, skill]));
  const merged = proposals.map((proposal) => {
    const previous = byId.get(proposal.id);
    if (!previous) return proposal;
    return {
      ...proposal,
      status: previous.status,
      trainerReview: previous.trainerReview,
      createdAt: previous.createdAt,
      updatedAt: previous.updatedAt,
    };
  });
  const proposedIds = new Set(proposals.map((proposal) => proposal.id));
  const retainedReviews = existing.filter((skill) => !proposedIds.has(skill.id) && skill.trainerReview !== "unreviewed");
  return [...merged, ...retainedReviews];
}

function actionSkillMarkdown(state) {
  const skills = state.actionSkills || [];
  const battleState = state.trainerState || validateTrainerEmotion();
  const sections = skills.length ? skills.map((skill) => {
    const move = skill.forecast?.lifeMove;
    const steps = skill.steps.map((step) => `${step.order}. ${step.kind} · ${step.control} · ${step.pageClass} · ${step.risk} risk`).join("\n");
    return `## ${skill.name}\n\n- ID: \`${skill.id}\`\n- Site: \`${skill.site}\`\n- Status: **${skill.status}**\n- Evidence: ${skill.evidence.distinctSessions} sessions, ${skill.evidence.occurrences} occurrences, ${skill.evidence.confidence}% confidence\n- Stakes move: **${move?.move || "check"}** — ${move?.reason || "Gather more evidence."}\n- Execution: ${skill.executionPolicy.mode}; confirmation required: ${skill.executionPolicy.confirmationRequired}\n\n${steps}`;
  }).join("\n\n") : "No Action Skills have earned a proposal yet. Three distinct sessions are required.";
  return `---\nname: agentmon-actions\ndescription: Local, inspectable website workflows learned from finite semantic actions. Use only on the bound site and always follow the listed confirmation policy.\n---\n\n# Agentmon Action Skills\n\nResonance: **${state.resonance}** (bound to this Agentmon's hatch DNA; not a global default)\n\nCurrent battle state: **${battleState.state} ${battleState.intensity}/5** (${battleState.source})\n\nPrivacy boundary: no raw text, field values, screenshots, keystrokes, credentials, selectors, URLs, or paths are stored.\n\n${sections}\n`;
}

async function persistActionState(path, actionSkillPath, state) {
  await writeJson(path, state);
  await atomicWrite(actionSkillPath, actionSkillMarkdown(state));
}

async function loadActionState(rootDir, slot, now = new Date().toISOString()) {
  const safe = safeSlot(slot);
  const agentmon = await readAgentmonState(rootDir, safe);
  if (!agentmon) throw new Error(`No Agentmon is hatched in slot ${safe}.`);
  const resonance = deterministicResonance(agentmon);
  const paths = pathsFor(rootDir, safe);
  const path = paths.actions;
  const existing = await readJson(path, null);
  if (!existing) return { path, actionSkillPath: paths.actionSkill, agentmon, state: blankActionState(agentmon, resonance, now) };
  if (existing.format !== ACTION_LEARNING_FORMAT || existing.agentmonId !== agentmon.id) throw new Error("Action-learning state does not belong to this Agentmon.");
  if (existing.resonance !== resonance) throw new Error("Permanent Action resonance binding changed unexpectedly.");
  return { path, actionSkillPath: paths.actionSkill, agentmon, state: { ...existing, trainerState: existing.trainerState || validateTrainerEmotion() } };
}

export async function recordActionEvent({ rootDir, slot = "main", input, now = new Date().toISOString() }) {
  const { path, actionSkillPath, agentmon, state } = await loadActionState(rootDir, slot, now);
  const event = validateActionEvent({ ...input, emotion: state.trainerState, observedAt: input?.observedAt || now });
  const events = [...state.events.filter((item) => item.id !== event.id), event]
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
    .slice(-MAX_EVENTS);
  const proposals = deriveActionSkills(agentmon, events, { resonance: state.resonance, outcomes: state.outcomes, now });
  const actionSkills = mergeReviews(proposals, state.actionSkills || []);
  const next = { ...state, events, actionSkills, updatedAt: now };
  await persistActionState(path, actionSkillPath, next);
  return {
    accepted: true,
    event: { id: event.id, digest: event.digest, kind: event.kind, control: event.control, pageClass: event.pageClass, risk: event.risk },
    status: actionLearningSummary(next),
  };
}

export async function declareActionEmotion({ rootDir, slot = "main", input, now = new Date().toISOString() }) {
  const { path, actionSkillPath, state } = await loadActionState(rootDir, slot, now);
  const trainerState = validateTrainerEmotion({
    state: input?.state,
    intensity: input?.intensity,
    source: "trainer-declared",
    declaredAt: now,
  });
  const next = { ...state, trainerState, updatedAt: now };
  await persistActionState(path, actionSkillPath, next);
  return { trainerState, status: actionLearningSummary(next) };
}

export async function reviewActionProposal({ rootDir, slot = "main", actionSkillId, review, now = new Date().toISOString() }) {
  const { path, actionSkillPath, state } = await loadActionState(rootDir, slot, now);
  const index = state.actionSkills.findIndex((skill) => skill.id === actionSkillId);
  if (index === -1) throw new Error("Unknown Action Skill proposal.");
  const actionSkills = [...state.actionSkills];
  actionSkills[index] = reviewActionSkill(actionSkills[index], review, now);
  const next = { ...state, actionSkills, updatedAt: now };
  await persistActionState(path, actionSkillPath, next);
  return { skill: actionSkills[index], status: actionLearningSummary(next) };
}

export async function simulateActionProposal({ rootDir, slot = "main", actionSkillId, grantedSites = [] }) {
  const { state } = await loadActionState(rootDir, slot);
  const skill = state.actionSkills.find((item) => item.id === actionSkillId);
  if (!skill) throw new Error("Unknown Action Skill proposal.");
  return simulateActionSkill(skill, { grantedSites });
}

export async function recordActionOutcome({ rootDir, slot = "main", input, now = new Date().toISOString() }) {
  const { path, actionSkillPath, state } = await loadActionState(rootDir, slot, now);
  const skill = state.actionSkills.find((item) => item.id === input?.actionSkillId);
  if (!skill) throw new Error("Unknown Action Skill for outcome.");
  const actionKey = String(input?.actionKey || "");
  if (!/^[a-z0-9.-]+:[a-z-]+:[a-z-]+:[a-z-]+$/i.test(actionKey)) throw new Error("Action outcome requires a semantic action key, never raw text.");
  const bounded = (value) => Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
  const outcome = {
    format: "agentmon.action-outcome/v1",
    id: `action-outcome-${actionDigest(`${skill.id}:${actionKey}:${now}`).slice(0, 20)}`,
    actionSkillId: skill.id,
    actionKey,
    score: bounded(input.score),
    relationshipScore: bounded(input.relationshipScore),
    optionalityScore: bounded(input.optionalityScore),
    decisionQuality: new Set(["sound", "unsound", "unknown"]).has(input.decisionQuality) ? input.decisionQuality : "unknown",
    observedOutcome: new Set(["success", "failure", "unknown"]).has(input.observedOutcome) ? input.observedOutcome : "unknown",
    recordedAt: now,
    rawTextStored: false,
  };
  const outcomes = [...state.outcomes.filter((item) => item.id !== outcome.id), outcome].slice(-MAX_OUTCOMES);
  const next = { ...state, outcomes, updatedAt: now };
  await persistActionState(path, actionSkillPath, next);
  return { outcome, status: actionLearningSummary(next) };
}

export function actionLearningSummary(state) {
  return {
    format: "agentmon.action-learning-summary/v1",
    agentmonId: state.agentmonId,
    resonance: state.resonance,
    resonanceBinding: state.resonanceBinding,
    observedEvents: state.events.length,
    proposed: state.actionSkills.filter((skill) => skill.status === "proposed").length,
    approved: state.actionSkills.filter((skill) => skill.status === "approved").length,
    proven: state.actionSkills.filter((skill) => skill.status === "proven").length,
    outcomes: state.outcomes.length,
    trainerState: state.trainerState || validateTrainerEmotion(),
    skills: state.actionSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      site: skill.site,
      resonance: skill.resonance,
      status: skill.status,
      trainerReview: skill.trainerReview,
      confidence: skill.evidence.confidence,
      distinctSessions: skill.evidence.distinctSessions,
      steps: skill.steps,
      forecast: skill.forecast,
    })),
    updatedAt: state.updatedAt,
    privacy: state.privacy,
  };
}

export async function readActionLearningStatus({ rootDir, slot = "main" }) {
  const { state } = await loadActionState(rootDir, slot);
  return actionLearningSummary(state);
}
