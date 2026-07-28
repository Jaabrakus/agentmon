import { actionRisk, semanticActionKey } from "./action-contract.mjs";
import { selectLifeMove } from "./life-strategy.mjs";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function outcomeValue(outcomes, actionKey) {
  const rows = outcomes.filter((outcome) => outcome.actionKey === actionKey);
  if (!rows.length) return 0;
  return rows.reduce((sum, outcome) => sum + clamp(Number(outcome.score) || 0, -100, 100), 0) / rows.length;
}

function futureValue(outcomes, actionKey, field) {
  const rows = outcomes.filter((outcome) => outcome.actionKey === actionKey && Number.isFinite(Number(outcome[field])));
  if (!rows.length) return { value: 0, evidence: 0 };
  return {
    value: Math.round(rows.reduce((sum, outcome) => sum + clamp(Number(outcome[field]), -100, 100), 0) / rows.length),
    evidence: rows.length,
  };
}

export function forecastNextAction(events = [], context = {}, outcomes = []) {
  const ordered = [...events].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const currentKey = context.currentActionKey || semanticActionKey(ordered.at(-1) || context);
  const counts = new Map();
  let opportunities = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (semanticActionKey(ordered[index]) !== currentKey) continue;
    if (ordered[index + 1].session !== ordered[index].session) continue;
    opportunities += 1;
    const next = ordered[index + 1];
    const key = semanticActionKey(next);
    const existing = counts.get(key) || { key, event: next, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  const alternatives = [...counts.values()].map((candidate) => {
    const probability = opportunities ? candidate.count / opportunities : 0;
    const riskPenalty = { low: 0, medium: 18, high: 45 }[actionRisk(candidate.event.control)];
    const learnedValue = outcomeValue(outcomes, candidate.key);
    const relationship = futureValue(outcomes, candidate.key, "relationshipScore");
    const optionality = futureValue(outcomes, candidate.key, "optionalityScore");
    const expectedValue = Math.round(probability * 100 + learnedValue * 0.45 + relationship.value * 0.35 + optionality.value * 0.2 - riskPenalty);
    return {
      actionKey: candidate.key,
      kind: candidate.event.kind,
      control: candidate.event.control,
      pageClass: candidate.event.pageClass,
      probability: Math.round(probability * 100),
      expectedValue,
      relationshipValue: relationship,
      futureOptionality: optionality,
      evidence: candidate.count,
      risk: actionRisk(candidate.event.control),
      reversible: candidate.event.reversible,
    };
  }).sort((left, right) => right.expectedValue - left.expectedValue || right.probability - left.probability || left.actionKey.localeCompare(right.actionKey));
  const selected = alternatives[0] || null;
  const confidence = selected ? clamp(Math.round(selected.probability * Math.min(1, opportunities / 5)), 0, 99) : 0;
  const relationshipStakes = new Set(["none", "low", "medium", "high"]).has(context.relationshipStakes) ? context.relationshipStakes : "none";
  const consent = new Set(["clear", "unclear", "not-required"]).has(context.consent) ? context.consent : "unclear";
  let decision = "fold";
  if (selected && selected.relationshipValue.evidence > 0 && selected.relationshipValue.value < 0) decision = "fold";
  else if (selected && relationshipStakes === "high") decision = "ask";
  else if (selected && consent === "unclear" && selected.risk !== "low") decision = "fold";
  else if (selected && selected.risk === "low" && confidence >= 75) decision = "suggest";
  else if (selected && selected.risk !== "high" && confidence >= 40) decision = "ask";
  const forecast = {
    format: "agentmon.action-forecast/v1",
    known: { matchingTransitions: opportunities, observedAlternatives: alternatives.length },
    unknown: ["future page state", "trainer intent", "external side effects", "another person's private thoughts or future response", "whether the interface changed"],
    relationship: {
      stakes: relationshipStakes,
      consent,
      policy: "Preserve trust and future optionality; never infer hidden emotions or autonomously manage a relationship.",
    },
    estimate: { selected, alternatives: alternatives.slice(0, 5), confidence },
    decision,
    rationale: decision === "suggest"
      ? "A repeated low-risk continuation has sufficient evidence."
      : decision === "ask"
        ? "The continuation is plausible but needs trainer confirmation, especially when relationships are involved."
        : "Evidence is weak, consent is unclear, or future downside is too high; preserve optionality and do not guess.",
    outcomeSeparatedFromDecision: true,
  };
  forecast.lifeMove = selectLifeMove(forecast, context);
  return forecast;
}
