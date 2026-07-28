#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPhenotype } from "../lib/visual/phenotype-engine.mjs";
import { renderPhenotypePng } from "../lib/visual/pixel-renderer.mjs";

const VARIANTS = [
  { body: "square", eyes: "bright", ears: "antenna", tail: "cable", marking: "circuit", coreGlyph: "diamond", limbs: "boots", stance: "compact", handedness: "right", paletteId: "mint-arcade" },
  { body: "moth", eyes: "visor", ears: "wing", tail: "orb", marking: "constellation", coreGlyph: "loop", limbs: "hover", stance: "wide", handedness: "left", paletteId: "violet-orbit" },
  { body: "drake", eyes: "cyclops", ears: "horn", tail: "blade", marking: "stripe", coreGlyph: "bolt", limbs: "claws", stance: "tall", handedness: "right", paletteId: "cobalt-lab" },
];

function previewAgentmon(index, variant) {
  const dna = `${String(index + 1).repeat(8)}A7E17D0C${String(index + 3).repeat(48)}`.slice(0, 64);
  return {
    id: `AGM-APP-${index}`,
    dna,
    species: ["Archive Familiar", "Relay Moth", "Compass Drake"][index],
    traitKey: ["reliability", "curiosity", "initiative"][index],
    primaryColor: ["#43C98B", "#8E63D2", "#3978D4"][index],
    accentColor: ["#7756C9", "#50C5B7", "#53C7A2"][index],
    promptprint: { archetype: ["SYSTEMS KEEPER", "SIGNAL SEEKER", "DECISION SCOUT"][index] },
    lineage: { genesisDNA: dna, currentDNA: dna, generation: 1 },
    visualPreferences: { paletteId: variant.paletteId, harmony: "heritage" },
    proceduralSkills: [],
    arenaReport: { results: [] },
  };
}

export async function generateAppSprites(outputDir = "public/agentmon-sprites") {
  const destination = resolve(outputDir);
  await mkdir(destination, { recursive: true });
  const outputs = [];
  for (const [index, variant] of VARIANTS.entries()) {
    const { paletteId: _paletteId, ...identityOverride } = variant;
    const phenotype = createPhenotype(previewAgentmon(index, variant), { identityOverride });
    const creature = resolve(destination, `variant-${index}.png`);
    const egg = resolve(destination, `egg-${index}.png`);
    await Promise.all([
      writeFile(creature, renderPhenotypePng(phenotype, { scale: 3 })),
      writeFile(egg, renderPhenotypePng(phenotype, { kind: "egg", scale: 3 })),
    ]);
    outputs.push({ creature, egg, phenotypeDigest: phenotype.digest });
  }
  const rivalIdentity = { body: "shield", eyes: "star", ears: "crystal", tail: "rune", marking: "mask", coreGlyph: "cross", limbs: "spikes", stance: "wide", handedness: "left" };
  const rival = createPhenotype(previewAgentmon(1, { ...rivalIdentity, paletteId: "plum-nocturne" }), { identityOverride: rivalIdentity });
  const rivalPath = resolve(destination, "rival.png");
  await writeFile(rivalPath, renderPhenotypePng(rival, { scale: 3 }));
  return { destination, outputs, rival: rivalPath };
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  generateAppSprites(process.argv[2]).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
