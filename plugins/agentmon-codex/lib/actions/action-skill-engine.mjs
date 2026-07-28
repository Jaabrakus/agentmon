import { actionDigest, ACTION_SKILL_FORMAT, deterministicResonance, resonanceProfile, semanticActionKey } from "./action-contract.mjs";
import { forecastNextAction } from "./poker-forecast.mjs";

function orderedSessions(events) {
  const sessions = new Map();
  for (const event of [...events].sort((left, right) => left.observedAt.localeCompare(right.observedAt))) {
    const rows = sessions.get(event.session) || [];
    rows.push(event);
    sessions.set(event.session, rows);
  }
  return sessions;
}

function sequenceCandidates(events) {
  const candidates = new Map();
  for (const [session, rows] of orderedSessions(events)) {
    for (let size = 2; size <= Math.min(5, rows.length); size += 1) {
      for (let start = 0; start <= rows.length - size; start += 1) {
        const sequence = rows.slice(start, start + size);
        if (new Set(sequence.map((event) => event.site)).size !== 1) continue;
        const key = sequence.map(semanticActionKey).join(">");
        const candidate = candidates.get(key) || { key, sequence, occurrences: 0, sessions: new Set(), digests: new Set() };
        candidate.occurrences += 1;
        candidate.sessions.add(session);
        sequence.forEach((event) => candidate.digests.add(event.digest));
        candidates.set(key, candidate);
      }
    }
  }
  return [...candidates.values()]
    .filter((candidate) => candidate.sessions.size >= 3)
    .sort((left, right) => right.sessions.size - left.sessions.size || right.sequence.length - left.sequence.length || left.key.localeCompare(right.key));
}

function policyFor(resonance, sequence) {
  const profile = resonanceProfile(resonance);
  const observed = [...new Set(sequence.map((event) => event.control))];
  const forbidden = ["delete", "approve", "send", "share", "submit", "upload"].filter((control) => !observed.includes(control) || profile.mode !== "operator");
  return {
    mode: profile.executionMode,
    automaticRiskCeiling: profile.mode === "operator" ? "low" : "none",
    confirmationRequired: true,
    allowedControls: observed.filter((control) => !forbidden.includes(control)),
    forbiddenControls: forbidden,
  };
}

function actionName(sequence) {
  const first = sequence[0];
  const verbs = sequence.map((event) => event.control).filter((value, index, all) => value !== "unknown" && all.indexOf(value) === index).slice(0, 3);
  return `${first.pageClass} ${verbs.length ? verbs.join(" → ") : "workflow"}`.replace(/^./, (character) => character.toUpperCase()).slice(0, 100);
}

export function deriveActionSkills(agentmon, events = [], options = {}) {
  const resonance = options.resonance || deterministicResonance(agentmon);
  return sequenceCandidates(events).slice(0, options.maximum ?? 8).map((candidate) => {
    const sequence = candidate.sequence;
    const confidence = Math.min(95, Math.round(25 + candidate.sessions.size * 15 + Math.min(15, candidate.occurrences * 3)));
    const id = `action-${actionDigest(`${agentmon?.id || "unbound"}:${candidate.key}`).slice(0, 16)}`;
    const steps = sequence.map((event, index) => ({
      order: index + 1,
      kind: event.kind,
      control: event.control,
      pageClass: event.pageClass,
      risk: event.risk,
      reversible: event.reversible,
    }));
    if (resonanceProfile(resonance).addsCheckpoint) {
      const consequential = steps.findIndex((step) => step.risk === "high");
      if (consequential >= 0) steps.splice(consequential, 0, { order: consequential + 1, kind: "checkpoint", control: "continue", pageClass: steps[consequential].pageClass, risk: "low", reversible: true });
      steps.forEach((step, index) => { step.order = index + 1; });
    }
    return {
      format: ACTION_SKILL_FORMAT,
      id,
      name: actionName(sequence),
      resonance,
      site: sequence[0].site,
      trigger: { pageClass: sequence[0].pageClass, startingAction: sequence[0].control },
      steps,
      executionPolicy: policyFor(resonance, sequence),
      forecast: forecastNextAction(events, {
        currentActionKey: semanticActionKey(sequence.at(-2)),
        emotionState: sequence.at(-1)?.emotion?.state,
        emotionIntensity: sequence.at(-1)?.emotion?.intensity,
        emotionSource: sequence.at(-1)?.emotion?.source,
      }, options.outcomes || []),
      evidence: { distinctSessions: candidate.sessions.size, occurrences: candidate.occurrences, confidence, digests: [...candidate.digests].sort() },
      privacy: { rawTextStored: false, fieldValuesStored: false, screenshotsStored: false, keystrokesStored: false, localOnly: true },
      status: "proposed",
      trainerReview: "unreviewed",
      createdAt: options.now || new Date().toISOString(),
      updatedAt: options.now || new Date().toISOString(),
    };
  });
}

export function reviewActionSkill(skill, review, now = new Date().toISOString()) {
  if (!skill || skill.format !== ACTION_SKILL_FORMAT) throw new Error("Expected an Agentmon Action Skill.");
  if (!new Set(["confirmed", "rejected"]).has(review)) throw new Error("Action Skill review must be confirmed or rejected.");
  return { ...skill, trainerReview: review, status: review === "confirmed" ? "approved" : "rejected", updatedAt: now };
}

export function simulateActionSkill(skill, context = {}) {
  const grantedSites = new Set(context.grantedSites || []);
  const siteGranted = grantedSites.has(skill.site);
  return {
    format: "agentmon.action-simulation/v1",
    actionSkillId: skill.id,
    resonance: skill.resonance,
    site: skill.site,
    executable: false,
    steps: skill.steps.map((step) => ({
      ...step,
      decision: !siteGranted ? "deny" : step.risk === "high" || step.kind === "checkpoint" ? "ask" : "preview",
      reason: !siteGranted ? "Site permission is missing." : step.risk === "high" ? "Consequential action requires confirmation." : step.kind === "checkpoint" ? "Resonance policy inserted a trainer checkpoint." : "Simulation only; no action was taken.",
    })),
    forecast: skill.forecast,
    privacy: { rawPageIncluded: false, fieldValuesIncluded: false, screenshotIncluded: false },
  };
}

export function authorizeAction(skill, request = {}) {
  const control = String(request.control || "");
  if (skill.trainerReview !== "confirmed" || !["approved", "testing", "proven"].includes(skill.status)) return { decision: "deny", reason: "Trainer approval is required." };
  if (request.site !== skill.site) return { decision: "deny", reason: "Action Skill is bound to a different site." };
  if (!request.grantedSites?.includes(skill.site)) return { decision: "deny", reason: "Site permission is missing." };
  if (skill.executionPolicy.forbiddenControls.includes(control)) return { decision: "deny", reason: "Control is forbidden by the skill policy." };
  if (!skill.executionPolicy.allowedControls.includes(control)) return { decision: "deny", reason: "Control was not part of the approved workflow." };
  if (skill.resonance !== "operator") return { decision: "ask", reason: `${skill.resonance} resonance advises but does not execute.` };
  if (skill.status !== "proven" || request.arenaProven !== true) return { decision: "ask", reason: "Operator execution requires arena proof." };
  if (request.risk !== "low") return { decision: "ask", reason: "Only low-risk actions may run automatically." };
  return { decision: "allow", reason: "Approved, proven, site-scoped, low-risk Operator action." };
}
