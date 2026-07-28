#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HARMONY_MODES, PALETTE_FAMILIES } from "../lib/visual/palette-engine.mjs";
import { createPhenotype, visualCombinationSpace } from "../lib/visual/phenotype-engine.mjs";
import { renderPhenotypeGallery } from "../lib/visual/gallery-renderer.mjs";

const TRAITS = ["reasoning", "curiosity", "reliability", "initiative", "empathy", "toolcraft"];

function dna(index) {
  return createHash("sha256").update(`agentmon-visual-catalog-v2:${index}`).digest("hex").toUpperCase();
}

function previewAgentmon(index) {
  const genesisDNA = dna(index);
  const generation = 1 + (index % 4);
  const currentDNA = generation === 1 ? genesisDNA : dna(index + generation * 10_000);
  const procedureId = `gallery-procedure-${index % 6}`;
  const hasEquipment = index % 3 === 0;
  return {
    id: `AGM-GALLERY-${String(index + 1).padStart(3, "0")}`,
    dna: currentDNA,
    species: `Preview${index + 1}`,
    traitKey: TRAITS[index % TRAITS.length],
    promptprint: { archetype: `VISUAL CATALOG ${index + 1}` },
    lineage: { genesisDNA, currentDNA, generation },
    form: generation > 1 ? `Preview${index + 1} Gen ${generation}` : `Preview${index + 1}`,
    visualPreferences: {
      paletteId: PALETTE_FAMILIES[index % PALETTE_FAMILIES.length].id,
      harmony: HARMONY_MODES[Math.floor(index / PALETTE_FAMILIES.length) % HARMONY_MODES.length],
    },
    proceduralSkills: hasEquipment ? [{ id: procedureId, trainerReview: "confirmed" }] : [],
    arenaReport: { results: hasEquipment ? [{ procedureId, status: "proven" }] : [] },
  };
}

export async function generateVisualGallery(options = {}) {
  const count = Math.max(12, Math.min(128, Number(options.count) || 24));
  const phenotypes = Array.from({ length: count }, (_, index) => createPhenotype(previewAgentmon(index)));
  const kind = options.kind === "egg" ? "egg" : "creature";
  const gallery = renderPhenotypeGallery(phenotypes, { columns: options.columns ?? 6, scale: options.scale ?? 2, kind });
  const output = resolve(options.output ?? "public/agentmon-premium-diversity-gallery.png");
  const manifestPath = output.replace(/\.png$/i, ".json");
  const manifest = {
    format: "agentmon.visual-gallery/v2",
    generatedBy: "Agentmon premium deterministic pixel engine",
    qualityStandard: "agentmon-premium-pixel/v1",
    phenotypeFormat: phenotypes[0].format,
    kind,
    combinationSpace: visualCombinationSpace(),
    layout: gallery.layout,
    specimens: phenotypes.map((phenotype) => ({ agentmonId: phenotype.agentmonId, digest: phenotype.digest, identity: phenotype.identity, palette: phenotype.palette, mutation: phenotype.mutation, equipment: phenotype.equipment })),
    privacy: { rawPromptsIncluded: false, hiddenReasoningIncluded: false },
  };
  await mkdir(dirname(output), { recursive: true });
  await Promise.all([writeFile(output, gallery.png), writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)]);
  return { output, manifestPath, manifest };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
  const kind = value("--kind", "creature") === "egg" ? "egg" : "creature";
  const defaultOutput = kind === "egg" ? "public/agentmon-egg-variant-gallery.png" : "public/agentmon-premium-diversity-gallery.png";
  const result = await generateVisualGallery({ output: value("--out", defaultOutput), count: value("--count", 24), columns: value("--columns", 6), scale: value("--scale", 2), kind });
  process.stdout.write(`${JSON.stringify({ output: result.output, manifest: result.manifestPath, kind: result.manifest.kind, specimens: result.manifest.layout.count, baseCombinations: result.manifest.combinationSpace.baseCombinations }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
