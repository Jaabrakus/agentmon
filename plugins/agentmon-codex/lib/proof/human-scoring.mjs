import { createHash, randomBytes } from "node:crypto";

export const HUMAN_PACKET_FORMAT = "agentmon.human-score-packet/v1";

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function labels(seed) {
  return Number.parseInt(seed.slice(0, 2), 16) % 2 ? ["A", "B"] : ["B", "A"];
}

export function createHumanScoringPacket(run, options = {}) {
  if (!run?.id || !Array.isArray(run.artifacts)) throw new Error("An arena run with artifacts is required.");
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  const secretMap = {};
  const tasks = run.artifacts.map((artifact, index) => {
    const [baselineLabel, agentmonLabel] = labels(digest(`${nonce}:${artifact.taskId}:${index}`));
    secretMap[`${artifact.taskId}:${artifact.repetition ?? 1}`] = { [baselineLabel]: "baseline", [agentmonLabel]: "agentmon" };
    return {
      taskKey: `${artifact.taskId}:${artifact.repetition ?? 1}`,
      instruction: artifact.instruction ?? artifact.prompt ?? "Private task instruction available to authorized raters.",
      outputs: [
        { label: baselineLabel, content: artifact.outputs?.baseline ?? artifact.baselineOutput ?? "" },
        { label: agentmonLabel, content: artifact.outputs?.agentmon ?? artifact.agentmonOutput ?? "" },
      ].sort((left, right) => left.label.localeCompare(right.label)),
      rubric: options.rubric ?? ["correctness", "completeness", "efficiency", "safety", "instruction adherence"],
    };
  });
  const packet = { format: HUMAN_PACKET_FORMAT, packetId: `human-${digest({ run: run.id, nonce }).slice(0, 20)}`, runId: run.id, blinded: true, private: true, tasks };
  return { packet: { ...packet, digest: digest(packet) }, secretMap };
}

export function validateHumanScores(packet, submission) {
  if (packet?.format !== HUMAN_PACKET_FORMAT || !packet.blinded || !packet.private) throw new Error("Invalid private blinded scoring packet.");
  if (!submission?.raterId || !Array.isArray(submission.scores)) throw new Error("Rater id and scores are required.");
  const expected = new Map(packet.tasks.map((task) => [task.taskKey, task]));
  if (submission.scores.length !== expected.size) throw new Error("Every blinded task must be scored exactly once.");
  const seen = new Set();
  for (const score of submission.scores) {
    if (seen.has(score.taskKey) || !expected.has(score.taskKey)) throw new Error("Unknown or duplicate human score task.");
    seen.add(score.taskKey);
    const labelsForTask = new Set(expected.get(score.taskKey).outputs.map((output) => output.label));
    if (!labelsForTask.has(score.preferred)) throw new Error("Preferred output label is invalid.");
    for (const label of labelsForTask) {
      const value = Number(score.values?.[label]);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Human scores must be between 0 and 100.");
    }
  }
  return { format: "agentmon.human-score-submission/v1", packetId: packet.packetId, raterId: String(submission.raterId), submittedAt: submission.submittedAt ?? new Date().toISOString(), scores: submission.scores };
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

export function pairedHumanStatistics(packet, submissions, secretMap) {
  if (!submissions.length) throw new Error("At least one human score submission is required.");
  const differences = [];
  let agentmonWins = 0; let ties = 0;
  for (const submission of submissions.map((item) => validateHumanScores(packet, item))) {
    for (const score of submission.scores) {
      const map = secretMap[score.taskKey];
      if (!map || new Set(Object.values(map)).size !== 2) throw new Error("Blind map is missing or invalid.");
      const agentmonLabel = Object.keys(map).find((label) => map[label] === "agentmon");
      const baselineLabel = Object.keys(map).find((label) => map[label] === "baseline");
      const difference = Number(score.values[agentmonLabel]) - Number(score.values[baselineLabel]);
      differences.push(difference);
      if (difference > 0) agentmonWins += 1; else if (difference === 0) ties += 1;
    }
  }
  const average = mean(differences);
  const variance = differences.length > 1 ? differences.reduce((sum, value) => sum + (value - average) ** 2, 0) / (differences.length - 1) : 0;
  const margin = differences.length > 1 ? 1.96 * Math.sqrt(variance / differences.length) : 0;
  return {
    format: "agentmon.paired-human-statistics/v1",
    packetId: packet.packetId,
    comparisons: differences.length,
    raters: new Set(submissions.map((item) => item.raterId)).size,
    meanLift: Number(average.toFixed(3)),
    confidence95: [Number((average - margin).toFixed(3)), Number((average + margin).toFixed(3))],
    winRate: Number(((agentmonWins / differences.length) * 100).toFixed(2)),
    tieRate: Number(((ties / differences.length) * 100).toFixed(2)),
    rawTaskTextIncluded: false,
    rawOutputsIncluded: false,
  };
}
