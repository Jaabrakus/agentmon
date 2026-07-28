#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPhenotype, verifyPhenotype } from "../lib/visual/phenotype-engine.mjs";
import { advanceCuratedVisualPlan, createCuratedVisualPlan, renderCuratedVisualPng, verifyCuratedVisualPlan } from "../lib/visual/curated-visual-engine.mjs";
import { visualBindingAgentmon, visualLifecycle } from "../lib/visual/incubation-lifecycle.mjs";
import { updateVisualLineage, verifyVisualLineage } from "../lib/visual/visual-lineage.mjs";

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

export async function generateVisuals(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const slot = String(options.slot ?? "main").replace(/[^a-zA-Z0-9_-]/g, "-");
  const base = join(rootDir, ".agentmon", "roster", slot);
  const statePath = options.statePath ?? join(base, "agentmon.json");
  const visualDir = join(base, "visual");
  const agentmon = await readJson(statePath);
  if (!agentmon) throw new Error(`No Agentmon found at ${statePath}`);
  const previousLineage = await readJson(join(visualDir, "lineage.json"));
  const identityOverride = previousLineage?.forms?.at(-1)?.identity;
  const phenotype = verifyPhenotype(createPhenotype(agentmon, { identityOverride }));
  const lifecycle = visualLifecycle(agentmon);
  const existingPlan = lifecycle.speciesBound ? await readJson(join(visualDir, "curated-plan.json")) : null;
  const existingWasBound = existingPlan?.binding?.readinessScore >= 60 || (lifecycle.hatched && existingPlan?.binding?.readinessScore == null);
  let curatedPlan;
  try {
    curatedPlan = existingWasBound && existingPlan?.agentmonId === agentmon.id ? verifyCuratedVisualPlan(existingPlan) : null;
  } catch { curatedPlan = null; }
  curatedPlan ??= verifyCuratedVisualPlan(createCuratedVisualPlan(visualBindingAgentmon(agentmon)));
  curatedPlan = verifyCuratedVisualPlan(advanceCuratedVisualPlan(curatedPlan, agentmon));
  const reason = options.reason ?? (previousLineage?.format === "agentmon.visual-lineage/v1" ? "visual-engine-v2-migration" : undefined);
  const lineage = verifyVisualLineage(updateVisualLineage(previousLineage, phenotype, { reason }));
  const curatedEgg = renderCuratedVisualPng(curatedPlan, { kind: "egg" });
  const curatedCreature = renderCuratedVisualPng(curatedPlan);
  const writes = [
    atomicWrite(join(visualDir, "phenotype.json"), `${JSON.stringify(phenotype, null, 2)}\n`),
    atomicWrite(join(visualDir, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`),
    atomicWrite(join(visualDir, "egg.png"), curatedEgg),
    atomicWrite(join(visualDir, "creature.png"), curatedCreature),
    atomicWrite(join(visualDir, "agentmon.png"), curatedCreature),
    atomicWrite(join(visualDir, "lifecycle.json"), `${JSON.stringify({ format: "agentmon.visual-lifecycle/v1", ...lifecycle, agentmonId: agentmon.id, species: lifecycle.speciesBound ? curatedPlan.species : null, privacy: { rawPromptsIncluded: false } }, null, 2)}\n`),
  ];
  writes.push(atomicWrite(join(visualDir, lifecycle.speciesBound ? "curated-plan.json" : "candidate-plan.json"), `${JSON.stringify(curatedPlan, null, 2)}\n`));
  await Promise.all(writes);
  return { phenotype, curatedPlan, lifecycle, lineage, paths: { visualDir, phenotype: join(visualDir, "phenotype.json"), curatedPlan: join(visualDir, lifecycle.speciesBound ? "curated-plan.json" : "candidate-plan.json"), lifecycle: join(visualDir, "lifecycle.json"), egg: join(visualDir, "egg.png"), creature: join(visualDir, "creature.png") } };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
  const result = await generateVisuals({ rootDir: value("--root", process.cwd()), slot: value("--slot", "main") });
  process.stdout.write(`${JSON.stringify({ agentmonId: result.phenotype.agentmonId, form: result.phenotype.form, generation: result.phenotype.genome.generation, evolution: result.curatedPlan.evolution, lifecycle: result.lifecycle, species: result.lifecycle.speciesBound ? result.curatedPlan.species.id : null, morph: result.lifecycle.speciesBound ? result.curatedPlan.morph.id : null, rarity: result.lifecycle.speciesBound ? result.curatedPlan.morph.rarity : null, digest: result.curatedPlan.digest, paths: result.paths }, null, 2)}\n`);
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
