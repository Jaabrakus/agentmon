#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCuratedVisualPlan, curatedVisualManifest, CURATED_ASSET_ROOT } from "../lib/visual/curated-visual-engine.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.AGENTMON_SHARP_MODULE || "sharp");

function populationAgentmon(index) {
  const dna = createHash("sha256").update(`agentmon-population-v1:${index}`).digest("hex").toUpperCase();
  return { id: `AGM-POP-${String(index + 1).padStart(4, "0")}`, dna, traitKey: "population", promptprint: { archetype: "WILD POPULATION" }, lineage: { genesisDNA: dna, currentDNA: dna, generation: 1 } };
}

function galleryEntries(manifest, mode, count, form, speciesPool) {
  if (mode === "population") {
    return Array.from({ length: count }, (_, index) => {
      const plan = createCuratedVisualPlan(populationAgentmon(index));
      return { species: plan.species, morph: plan.morph };
    });
  }
  if (mode === "evolution") {
    return speciesPool.flatMap((species) => manifest.evolutionStages.map((stage) => ({
      species: {
        id: species.id,
        name: species.name,
        creatureAsset: `${stage.assetRoot}/${species.id}-standard.png`,
        eggAsset: `eggs/forms/${species.id}-standard.png`,
      },
      morph: { id: "standard", rarity: "common" },
      form: stage.id,
    })));
  }
  const stage = manifest.evolutionStages.find((candidate) => candidate.id === form) ?? manifest.evolutionStages[0];
  return speciesPool.map((species) => ({
    species: {
      id: species.id,
      name: species.name,
      creatureAsset: `${stage.assetRoot}/${species.id}-standard.png`,
      eggAsset: `eggs/forms/${species.id}-standard.png`,
    },
    morph: { id: "standard", rarity: "common" },
  }));
}

export async function generateCuratedGallery(options = {}) {
  const manifest = curatedVisualManifest();
  const kind = options.kind === "egg" ? "egg" : "creature";
  const mode = ["population", "evolution"].includes(options.mode) ? options.mode : "species";
  const form = options.form ?? "form-01";
  const biome = manifest.biomes?.find((candidate) => candidate.id === options.biome) ?? null;
  const speciesPool = biome ? manifest.species.filter((species) => biome.species.includes(species.id)) : manifest.species;
  const count = mode === "population" ? Math.max(16, Math.min(1024, Number(options.count) || 256)) : speciesPool.length;
  const entries = galleryEntries(manifest, mode, count, form, speciesPool);
  const columns = mode === "population" ? 16 : mode === "evolution" ? 12 : 4;
  const cell = mode === "population" ? 112 : mode === "evolution" ? 160 : 180;
  const spriteSize = cell - 8;
  const composites = [];
  for (const [index, entry] of entries.entries()) {
    const relative = kind === "egg" ? entry.species.eggAsset : entry.species.creatureAsset;
    const input = resolve(CURATED_ASSET_ROOT, relative);
    const sprite = await sharp(await readFile(input)).resize(spriteSize, spriteSize, { fit: "contain", kernel: "nearest" }).png().toBuffer();
    composites.push({ input: sprite, left: (index % columns) * cell + 4, top: Math.floor(index / columns) * cell + 4 });
  }
  const rows = Math.ceil(entries.length / columns);
  const scope = biome?.id ? `${biome.id}-` : "";
  const defaultOutput = mode === "population" ? `public/agentmon-${kind}-population-sample-${entries.length}.png` : mode === "evolution" ? `public/agentmon-${scope}evolution-lines-${speciesPool.length}.png` : `public/agentmon-${scope}${kind}-${form}-species-catalog-${entries.length}.png`;
  const output = resolve(options.output ?? defaultOutput);
  await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: { r: 255, g: 247, b: 226, alpha: 1 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(output);
  const morphCounts = Object.fromEntries(manifest.morphs.map((morph) => [morph.id, entries.filter((entry) => entry.morph.id === morph.id).length]));
  await writeFile(output.replace(/\.png$/i, ".json"), `${JSON.stringify({ format: "agentmon.species-gallery/v1", pack: manifest.id, biome: biome?.id ?? null, kind, mode, form: mode === "species" ? form : null, specimens: entries.length, speciesCount: manifest.speciesCount, formCount: manifest.formCount, catalogTargetSpecies: manifest.catalogTargetSpecies, morphCounts, privacy: manifest.privacy }, null, 2)}\n`);
  return { output, biome: biome?.id ?? null, kind, mode, form: mode === "species" ? form : null, specimens: entries.length, morphCounts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
  generateCuratedGallery({ kind: value("--kind", "creature"), mode: value("--mode", "species"), form: value("--form", "form-01"), biome: value("--biome", undefined), count: value("--count", 256), output: value("--out", undefined) }).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
