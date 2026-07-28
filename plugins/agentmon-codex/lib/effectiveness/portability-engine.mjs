const PROVIDERS = new Set(["openai", "anthropic", "google", "kimi", "venice", "local", "custom"]);

function boundedScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error("Portability scores must be between 0 and 100.");
  return Math.round(number);
}

export function recordPortabilityResult(agentmon, input) {
  const procedureId = String(input.procedureId || "");
  if (!agentmon.proceduralSkills?.some((procedure) => procedure.id === procedureId)) throw new Error(`Unknown procedure: ${procedureId}.`);
  if (!PROVIDERS.has(input.provider)) throw new Error("Unknown portability provider.");
  const model = String(input.model || "").trim();
  if (!model || model.length > 128) throw new Error("Portability result requires a bounded model id.");
  const result = {
    format: "agentmon.portability-result/v1",
    procedureId,
    provider: input.provider,
    model,
    baselineScore: boundedScore(input.baselineScore),
    agentmonScore: boundedScore(input.agentmonScore),
    suiteDigest: String(input.suiteDigest || "").toLowerCase(),
    recordedAt: input.recordedAt || new Date().toISOString(),
    rawPromptsStored: false,
    rawOutputsStored: false,
  };
  if (!/^[a-f0-9]{64}$/.test(result.suiteDigest)) throw new Error("Portability result requires a SHA-256 suite digest.");
  result.lift = result.agentmonScore - result.baselineScore;
  const portabilityResults = [...(agentmon.portabilityResults || []).filter((existing) => !(existing.procedureId === procedureId && existing.provider === result.provider && existing.model === result.model && existing.suiteDigest === result.suiteDigest)), result];
  const portabilityReport = buildPortabilityReport(portabilityResults);
  return { agentmon: { ...agentmon, portabilityResults, portabilityReport, trainedAt: result.recordedAt }, result };
}

export function buildPortabilityReport(results = []) {
  const matrix = Object.values(results.reduce((groups, result) => {
    const key = `${result.procedureId}:${result.provider}:${result.model}`;
    const group = groups[key] ||= { procedureId: result.procedureId, provider: result.provider, model: result.model, trials: 0, totalLift: 0, positive: 0 };
    group.trials += 1;
    group.totalLift += result.lift;
    if (result.lift >= 10) group.positive += 1;
    return groups;
  }, {})).map((group) => ({ ...group, averageLift: Math.round(group.totalLift / group.trials), status: group.trials >= 3 ? (group.positive / group.trials >= 2 / 3 ? "portable" : "model-bound") : "testing" }));
  return {
    format: "agentmon.portability/v1",
    providersTested: new Set(matrix.map((item) => item.provider)).size,
    modelsTested: matrix.length,
    portableCombinations: matrix.filter((item) => item.status === "portable").length,
    matrix,
    privacy: { rawPromptsIncluded: false, rawOutputsIncluded: false },
  };
}

export async function runPortabilityMatrix(agentmon, options = {}) {
  if (typeof options.runner !== "function") throw new Error("Portability evaluation requires an explicit runner adapter.");
  if (!Array.isArray(options.targets) || !options.targets.length) throw new Error("Portability evaluation requires at least one model target.");
  let current = agentmon;
  const privateRuns = [];
  for (const target of options.targets) {
    if (!PROVIDERS.has(target.provider) || !String(target.model || "").trim()) throw new Error("Portability target is invalid.");
    const measurement = await options.runner({ procedureId: options.procedureId, suite: options.suite, target: { ...target, provider: target.provider, model: target.model } });
    const recorded = recordPortabilityResult(current, {
      procedureId: options.procedureId,
      provider: target.provider,
      model: target.model,
      suiteDigest: options.suiteDigest,
      baselineScore: measurement.baselineScore,
      agentmonScore: measurement.agentmonScore,
    });
    current = recorded.agentmon;
    privateRuns.push({ target, measurement, result: recorded.result });
  }
  return { agentmon: current, privateRuns, report: current.portabilityReport, privacy: { rawPromptsPersisted: false, rawOutputsPersisted: false } };
}
