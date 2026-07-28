import { EMOTION_STATES, LIFE_MOVES } from "./action-contract.mjs";

function declaredEmotion(context = {}) {
  const source = context.emotionSource === "trainer-declared" ? "trainer-declared" : "unspecified";
  const requested = String(context.emotionState || "neutral").toLowerCase();
  const state = source === "trainer-declared" && EMOTION_STATES.includes(requested) ? requested : "neutral";
  const requestedIntensity = Number(context.emotionIntensity);
  const intensity = source === "trainer-declared" && Number.isFinite(requestedIntensity)
    ? Math.max(1, Math.min(5, Math.round(requestedIntensity)))
    : 0;
  return {
    state,
    intensity,
    source,
    policy: "Temporary trainer-declared context changes caution and timing, never evidence, truth, consent, or permission.",
  };
}

export function selectLifeMove(forecast, context = {}) {
  const emotion = declaredEmotion(context);
  const selected = forecast?.estimate?.selected || null;
  const highArousal = emotion.intensity >= 3 && new Set(["anxious", "frustrated", "energized", "overwhelmed"]).has(emotion.state);
  const relationshipStakes = forecast?.relationship?.stakes || "none";
  let move = "check";
  let reason = "Gather more information without commitment.";

  if (context.requestedMove === "bluff") {
    const allowed = context.domain === "game" && context.bluffAuthorized === true;
    return {
      format: "agentmon.life-move/v1",
      move: allowed ? "bluff" : "check",
      allowed,
      reason: allowed ? "Trainer-authorized bluff inside a bounded game." : "Bluff blocked outside an explicitly authorized game; use a truthful probe instead.",
      emotion,
      safeguards: ["Never fabricate facts", "Never impersonate", "Never conceal material risk", "Never manipulate a relationship"],
    };
  }

  if (context.requestedMove === "all-in") {
    return {
      format: "agentmon.life-move/v1",
      move: "stay",
      allowed: false,
      reason: "All-in is reserved for explicit trainer confirmation after downside and recovery review.",
      emotion,
      safeguards: ["Human confirmation required", "Name maximum downside", "Name recovery path", "Preserve an exit when possible"],
    };
  }

  if (highArousal) {
    move = "stay";
    reason = "Hold position until emotional intensity falls and evidence can be reviewed.";
  } else if (forecast?.decision === "fold") {
    move = "fold";
    reason = "Downside, consent, or uncertainty exceeds the available edge; preserve future optionality.";
  } else if (relationshipStakes === "high") {
    move = "stay";
    reason = "Maintain the relationship without escalating; the trainer decides the next commitment.";
  } else if (forecast?.decision === "ask") {
    move = "check";
    reason = "Ask or observe before committing.";
  } else if (selected && selected.risk === "low" && forecast.estimate.confidence >= 85 && selected.expectedValue >= 70) {
    move = "raise";
    reason = "Evidence, reversibility, and expected value support a bounded increase in commitment.";
  } else if (selected) {
    move = "call";
    reason = "Match the situation proportionally without escalating beyond the evidence.";
  }

  if (!LIFE_MOVES.includes(move)) throw new Error("Invalid Life Move.");
  return {
    format: "agentmon.life-move/v1",
    move,
    allowed: move !== "all-in" && move !== "bluff",
    reason,
    emotion,
    safeguards: ["Decision quality is separate from outcome luck", "Relationship moves remain trainer-controlled", "Unknown private emotions are never inferred"],
  };
}
