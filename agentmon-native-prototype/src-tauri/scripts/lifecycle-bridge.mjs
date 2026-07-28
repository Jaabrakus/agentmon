import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [command, rootDir, engineRoot = rootDir] = process.argv.slice(2);
const commands = new Set(["status", "train", "evolve"]);
if (!rootDir || !commands.has(command)) {
  process.stderr.write("Invalid Agentmon lifecycle request.\n");
  process.exit(2);
}

const statePath = resolve(rootDir, ".agentmon/roster/main/agentmon.json");

async function readInput() {
  let body = "";
  for await (const chunk of process.stdin) {
    body += chunk;
    if (body.length > 64 * 1024) throw new Error("Lifecycle input exceeds the 64 KiB local limit.");
  }
  return body ? JSON.parse(body) : {};
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function lifecycleStage(state) {
  if (!state) return { key: "signal", label: "UNBOUND SIGNAL", order: 0 };
  if ((Number(state.lineage?.generation) || 1) > 1 || state.form) {
    return { key: "hatched", label: state.form || state.species || "AGENTMON", order: 3 };
  }
  const readiness = Math.max(0, Math.min(100, Math.round(Number(state.hatchReadiness?.score) || 0)));
  if (readiness < 60) return { key: "signal", label: "FORMING SIGNAL", order: 1 };
  if (readiness < 100) return { key: "egg", label: "BOUND EGG", order: 2 };
  return { key: "hatched", label: state.form || state.species || "AGENTMON", order: 3 };
}

function levelState(state) {
  if (!state) return { level: 0, current: 0, next: 5, progress: 0, basis: "derived evidence" };
  const samples = Math.max(0, Number(state.sourceCount) || 0);
  const learned = (state.skillCandidates || []).filter((skill) => ["validated", "learned"].includes(skill.stage)).length;
  const proven = Math.max(0, Number(state.arenaReport?.provenProcedures) || 0);
  const outcomes = Math.max(0, Number(state.effectivenessReport?.totalOutcomes) || 0);
  const points = samples + learned * 3 + proven * 8 + Math.min(20, outcomes);
  const level = Math.max(1, Math.min(100, Math.floor(Math.sqrt(points + 1) * 3)));
  const floor = Math.max(0, Math.ceil((level / 3) ** 2) - 1);
  const next = level >= 100 ? points : Math.max(points + 1, Math.ceil(((level + 1) / 3) ** 2) - 1);
  const progress = level >= 100 ? 100 : Math.max(0, Math.min(100, Math.round(((points - floor) / Math.max(1, next - floor)) * 100)));
  return { level, current: points, next, progress, basis: "samples + learned skills + arena proof + outcomes" };
}

function evolutionGate(state) {
  if (!state) return { ready: false, blockers: ["Hatch an Agentmon first."], inherited: 0, acquired: 0, fusions: 0 };
  const inherited = state.skillTree?.inheritedSkills?.length || 0;
  const acquired = state.skillTree?.acquiredSkills?.length || 0;
  const usedFusions = new Set((state.lineage?.events || [])
    .filter((event) => event.type === "evolution")
    .flatMap((event) => event.fusionIds || []));
  const fusions = (state.skillTree?.fusionMoves || []).filter((move) => !usedFusions.has(move.id)).length;
  const blockers = [];
  if (state.ownership?.status === "pending-transfer") blockers.push("A pending transfer freezes DNA changes.");
  if (!inherited) blockers.push("No inherited skill branch yet; receive a signed Agentmon lineage.");
  if (!acquired) blockers.push("No acquired skill branch yet; cross-train after receiving it.");
  if (!fusions) blockers.push("No unused fusion move has been earned.");
  if (state.lineage?.currentTrainer !== state.lineage?.originTrainer && state.ownership?.status !== "verified-transfer") {
    blockers.push("Transferred evolution requires a verified ownership certificate.");
  }
  return { ready: blockers.length === 0, blockers, inherited, acquired, fusions };
}

function summarize(state) {
  const stage = lifecycleStage(state);
  const level = levelState(state);
  const evolution = evolutionGate(state);
  return {
    format: "agentmon.desktop-lifecycle/v1",
    hasAgentmon: Boolean(state),
    rootDir,
    stage,
    level,
    evolution,
    identity: state ? {
      id: state.id,
      name: state.form || state.species,
      species: state.species,
      form: state.form || state.species,
      dna: state.lineage?.currentDNA || state.dna,
      generation: state.lineage?.generation || 1,
      archetype: state.promptprint?.archetype || "CALIBRATING",
      nature: state.nature || "UNKNOWN",
      trainer: state.lineage?.currentTrainer || state.trainerName,
    } : null,
    evidence: state ? {
      readiness: Math.max(0, Math.min(100, Math.round(Number(state.hatchReadiness?.score) || 0))),
      ready: state.hatchReadiness?.ready === true,
      distinctPrompts: state.hatchReadiness?.distinctPrompts || 0,
      behavioralPrompts: state.hatchReadiness?.behavioralPrompts || 0,
      intentDiversity: state.hatchReadiness?.intentDiversity || 0,
      sourceCount: state.sourceCount || 0,
      learnedSkills: state.learnedSkills?.length || 0,
      loops: state.loops?.length || 0,
      procedures: state.proceduralSkills?.length || 0,
      arenaProven: state.arenaReport?.provenProcedures || 0,
      outcomes: state.effectivenessReport?.totalOutcomes || 0,
    } : {
      readiness: 0, ready: false, distinctPrompts: 0, behavioralPrompts: 0,
      intentDiversity: 0, sourceCount: 0, learnedSkills: 0, loops: 0, procedures: 0,
      arenaProven: 0, outcomes: 0,
    },
    integrity: {
      rawPromptsStored: false,
      dnaMutableByTraining: false,
      skillMarkdownUserEditable: false,
      evolutionGate: "engine-enforced",
      ownership: state?.ownership?.status || "unregistered",
    },
  };
}

function normalizeTraining(input) {
  const trainerName = String(input.trainerName || "Local Trainer").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (trainerName.length < 2) throw new Error("Trainer name must contain at least 2 characters.");
  const allowedRoles = new Set(["builder", "researcher", "planner", "designer", "companion"]);
  const role = allowedRoles.has(input.role) ? input.role : "companion";
  const prompts = (Array.isArray(input.prompts) ? input.prompts : [])
    .map((prompt) => String(prompt || "").trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!prompts.length) throw new Error("Add at least one real example of how you work.");
  if (prompts.some((prompt) => prompt.length < 8 || prompt.length > 2_000)) throw new Error("Each training example must be 8–2,000 characters.");
  if (prompts.reduce((sum, prompt) => sum + prompt.length, 0) > 16_000) throw new Error("Training examples exceed the 16,000 character session limit.");
  return { trainerName, role, prompts };
}

function createFeed(prompts) {
  const revision = `desktop-${Date.now().toString(36)}-${randomUUID()}`;
  return {
    format: "agentmon.feed/v1",
    source: "agentmon-desktop",
    revision,
    generatedAt: new Date().toISOString(),
    consent: { scope: "user_prompts_only" },
    thread: { id: revision, label: "Desktop lifecycle training" },
    prompts: prompts.map((text, index) => ({
      id: createHash("sha256").update(`${revision}:${index}:${text}`).digest("hex").slice(0, 24),
      text,
      chars: text.length,
      redactions: 0,
    })),
    totals: {
      prompts: prompts.length,
      characters: prompts.reduce((sum, text) => sum + text.length, 0),
      redactions: 0,
    },
  };
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(0));
}

try {
  if (command === "status") {
    emit(summarize(await readState()));
  } else if (command === "train") {
    const input = normalizeTraining(await readInput());
    const moduleUrl = pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/scripts/agentmon.mjs")).href;
    const { createTrainerIdentity, processFeed } = await import(moduleUrl);
    if (!(await readState())) await createTrainerIdentity({ rootDir, name: input.trainerName });
    const result = await processFeed(createFeed(input.prompts), {
      rootDir,
      slot: "main",
      name: input.trainerName,
      role: input.role,
      retention: "derived-only",
    });
    emit({ ...summarize(result.agentmon), action: result.action, changed: result.changed });
  } else {
    const moduleUrl = pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/scripts/agentmon.mjs")).href;
    const { evolveAgentmonSlot } = await import(moduleUrl);
    const before = await readState();
    const gate = evolutionGate(before);
    if (!gate.ready) throw new Error(gate.blockers.join(" "));
    const result = await evolveAgentmonSlot({ rootDir, slot: "main" });
    emit({ ...summarize(result.agentmon), action: result.action, changed: result.changed });
  }
} catch (error) {
  process.stderr.write(`${error?.message || error}\n`, () => process.exit(1));
}
