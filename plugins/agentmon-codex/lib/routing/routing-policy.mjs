const STOP_WORDS = new Set("a an and are as at be by can do for from how i in is it me my of on or our please should that the this to we what when with you your".split(" "));

function stem(token) {
  if (token.length > 6 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  for (const suffix of ["ments", "ment", "ations", "ation", "ing", "ers", "er", "ed", "es", "s"]) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) return token.slice(0, -suffix.length);
  }
  return token;
}

export function routingTokens(value) {
  return new Set(String(value || "").toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{2,}/g)
    ?.filter((token) => !STOP_WORDS.has(token))
    .map(stem) || []);
}

function overlap(left, right) {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  for (const value of left) if (right.has(value)) matches += 1;
  return matches / Math.sqrt(left.size * right.size);
}

function phraseMatches(queryTokens, phrase) {
  const expected = routingTokens(phrase);
  return expected.size > 0 && [...expected].every((token) => queryTokens.has(token));
}

function boundedPolicy(procedure) {
  const source = procedure?.routing;
  if (!source || source.version !== 1) return null;
  const requiredConceptGroups = Array.isArray(source.requiredConceptGroups)
    ? source.requiredConceptGroups.slice(0, 6).map((group) => Array.isArray(group) ? group.slice(0, 12).map((value) => String(value).slice(0, 120)) : []).filter((group) => group.length)
    : [];
  const excludedConcepts = Array.isArray(source.excludedConcepts) ? source.excludedConcepts.slice(0, 24).map((value) => String(value).slice(0, 120)) : [];
  return {
    version: 1,
    requiredConceptGroups,
    excludedConcepts,
    minimumMatchedConcepts: Math.max(1, Math.min(12, Number(source.minimumMatchedConcepts) || 1)),
    minimumRelevance: Math.max(1, Math.min(100, Number(source.minimumRelevance) || 1)),
  };
}

export function evaluateProcedureMatch(query, procedure) {
  const queryTokens = routingTokens(query);
  const searchable = routingTokens([procedure.id, procedure.name, procedure.description, procedure.trigger, ...(procedure.inputs || [])].join(" "));
  const matchedConcepts = [...queryTokens].filter((token) => searchable.has(token)).length;
  const relevance = Math.round(overlap(queryTokens, searchable) * 100);
  const policy = boundedPolicy(procedure);
  if (!queryTokens.size) return { eligible: false, reason: "empty-query", relevance: 0, matchedConcepts: 0, policy: policy ? "explicit-v1" : "legacy-safe" };
  if (!matchedConcepts) return { eligible: false, reason: "no-semantic-overlap", relevance, matchedConcepts, policy: policy ? "explicit-v1" : "legacy-safe" };
  if (policy?.excludedConcepts.some((phrase) => phraseMatches(queryTokens, phrase))) {
    return { eligible: false, reason: "excluded-scope", relevance, matchedConcepts, policy: "explicit-v1" };
  }
  if (policy?.requiredConceptGroups.some((group) => !group.some((phrase) => phraseMatches(queryTokens, phrase)))) {
    return { eligible: false, reason: "missing-required-scope", relevance, matchedConcepts, policy: "explicit-v1" };
  }
  if (matchedConcepts < (policy?.minimumMatchedConcepts || 1) || relevance < (policy?.minimumRelevance || 1)) {
    return { eligible: false, reason: "below-semantic-threshold", relevance, matchedConcepts, policy: policy ? "explicit-v1" : "legacy-safe" };
  }
  return { eligible: true, reason: "semantic-match", relevance, matchedConcepts, policy: policy ? "explicit-v1" : "legacy-safe" };
}

export function routingAudit(evaluations, selectedCount) {
  const rejectedByReason = {};
  for (const evaluation of evaluations.filter((item) => !item.eligible)) rejectedByReason[evaluation.reason] = (rejectedByReason[evaluation.reason] || 0) + 1;
  return {
    format: "agentmon.routing-audit/v1",
    decision: selectedCount ? "procedure-match" : "identity-only",
    evaluatedProcedures: evaluations.length,
    selectedProcedures: selectedCount,
    rejectedByReason,
    rawQueryIncluded: false,
  };
}
