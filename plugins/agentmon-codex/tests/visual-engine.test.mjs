import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { createPhenotype, verifyPhenotype, visualCombinationSpace, visualDigest } from "../lib/visual/phenotype-engine.mjs";
import { PALETTE_FAMILIES } from "../lib/visual/palette-engine.mjs";
import { renderCreaturePixels, renderEggPixels, renderPhenotypePng } from "../lib/visual/pixel-renderer.mjs";
import { createMaterialRamps } from "../lib/visual/material-ramp.mjs";
import { updateVisualLineage, verifyVisualLineage } from "../lib/visual/visual-lineage.mjs";
import { generateVisuals } from "../scripts/agentmon-visual.mjs";
import { renderPhenotypeGallery } from "../lib/visual/gallery-renderer.mjs";
import { advanceCuratedVisualPlan, createCuratedVisualPlan, curatedVisualManifest, CURATED_ASSET_ROOT, renderCuratedVisualPng, verifyCuratedVisualPlan } from "../lib/visual/curated-visual-engine.mjs";
import { EGG_BIND_SCORE, HATCH_SCORE, visualLifecycle } from "../lib/visual/incubation-lifecycle.mjs";
import { DEFAULT_PIXEL_SNAP_STRENGTH, pixelSnapperProfile } from "../scripts/build-trait-visual-pack.mjs";

function fixture(overrides = {}) {
  return {
    id: "AGM-1234-ABCD", dna: "1234ABCD", species: "Loopix", traitKey: "reasoning",
    primaryColor: "#79D4B6", accentColor: "#8D65D6", promptprint: { archetype: "Systems Pathfinder" },
    lineage: { genesisDNA: "1234ABCD", currentDNA: "1234ABCD", generation: 1 },
    proceduralSkills: [{ id: "verify-loop", trainerReview: "confirmed" }],
    arenaReport: { results: [{ procedureId: "verify-loop", status: "proven" }] },
    ...overrides,
  };
}

function pngDimensions(png) {
  assert.deepEqual([...png.subarray(12, 16)], [73, 72, 68, 82]);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test("brightens an unbound signal before binding an egg and hatching", () => {
  assert.equal(EGG_BIND_SCORE, 60);
  assert.equal(HATCH_SCORE, 100);
  assert.deepEqual(visualLifecycle(null), { stage: "signal", score: 0, brightness: 8, label: "UNBOUND SIGNAL", speciesBound: false, hatched: false });
  assert.equal(visualLifecycle(fixture({ hatchReadiness: { score: 59 } })).stage, "signal");
  assert.equal(visualLifecycle(fixture({ hatchReadiness: { score: 60 } })).stage, "egg");
  assert.equal(visualLifecycle(fixture({ hatchReadiness: { score: 99 } })).stage, "egg");
  assert.equal(visualLifecycle(fixture({ hatchReadiness: { score: 100 } })).stage, "hatched");
});

test("creates deterministic raw-free phenotypes and valid pixel PNGs", () => {
  const first = createPhenotype(fixture());
  const second = createPhenotype(fixture());
  assert.deepEqual(first, second);
  assert.equal(verifyPhenotype(first), first);
  assert.equal(first.equipment[0].procedureId, "verify-loop");
  assert.equal(JSON.stringify(first).includes("prompt text"), false);
  const png = renderPhenotypePng(first);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("preserves identity while recording permanent visual generations", () => {
  const hatched = createPhenotype(fixture());
  const first = updateVisualLineage(null, hatched, { recordedAt: "2026-01-01T00:00:00.000Z" });
  const evolved = createPhenotype(fixture({ dna: "DEADBEEF", form: "Loopix Nexus", lineage: { genesisDNA: "1234ABCD", currentDNA: "DEADBEEF", generation: 2 } }));
  const second = verifyVisualLineage(updateVisualLineage(first, evolved, { recordedAt: "2026-02-01T00:00:00.000Z" }));
  assert.equal(second.forms.length, 2);
  assert.equal(second.forms.at(-1).generation, 2);
  assert.equal(second.identityLock, first.identityLock);
  assert.notEqual(second.currentFormDigest, first.currentFormDigest);
});

test("migrates a v1 identity lock by preserving every legacy anatomy gene", () => {
  const phenotype = createPhenotype(fixture());
  const legacyIdentity = Object.fromEntries(Object.entries(phenotype.identity).filter(([key]) => !["limbs", "stance"].includes(key)));
  const legacy = {
    format: "agentmon.visual-lineage/v1",
    agentmonId: phenotype.agentmonId,
    genesisDNA: phenotype.genome.genesisDNA,
    identityLock: visualDigest(legacyIdentity),
    currentFormDigest: "legacy-form",
    forms: [{ formDigest: "legacy-form", currentDNA: phenotype.genome.currentDNA, generation: 1, form: phenotype.form, identity: legacyIdentity, palette: phenotype.palette, mutation: phenotype.mutation, equipment: [], reason: "hatch", recordedAt: "2026-01-01T00:00:00.000Z" }],
    digest: "legacy-digest",
  };
  const migrated = updateVisualLineage(legacy, phenotype, { reason: "visual-engine-v2-migration", recordedAt: "2026-02-01T00:00:00.000Z" });
  assert.equal(migrated.format, "agentmon.visual-lineage/v2");
  assert.equal(migrated.identityLockHistory[0].identityLock, legacy.identityLock);
  assert.throws(() => updateVisualLineage(legacy, { ...phenotype, identity: { ...phenotype.identity, coreGlyph: "moon" } }), /Permanent visual identity changed/);
});

test("writes visual artifacts through a thin CLI service", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-visual-"));
  try {
    const roster = join(rootDir, ".agentmon", "roster", "main");
    await mkdir(roster, { recursive: true });
    await writeFile(join(roster, "agentmon.json"), JSON.stringify(fixture()));
    const result = await generateVisuals({ rootDir, slot: "main" });
    const png = await readFile(result.paths.creature);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(result.curatedPlan.renderer, "agentmon-trait-atlas/v4");
    assert.equal(result.curatedPlan.qualityGate.status, "passed");
    assert.deepEqual(pngDimensions(png), [256, 256]);
    assert.equal(JSON.parse(await readFile(result.paths.curatedPlan, "utf8")).format, "agentmon.curated-visual-plan/v2");
    assert.equal(JSON.parse(await readFile(result.paths.phenotype, "utf8")).format, "agentmon.phenotype/v2");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("exposes billions of deterministic combinations with a curated palette library", () => {
  const space = visualCombinationSpace();
  assert.equal(PALETTE_FAMILIES.length, 16);
  assert.equal(space.baseCombinations, 2_304_000_000);
  assert.deepEqual(space.excludes, ["equipment combinations", "evolution mutations", "animation frames"]);
});

test("renders a collision-free deterministic sample across anatomy and color schemes", () => {
  const digests = new Set();
  for (let index = 0; index < 256; index += 1) {
    const seed = createHash("sha256").update(`collision-sample:${index}`).digest("hex").toUpperCase();
    const phenotype = createPhenotype(fixture({
      id: `AGM-SAMPLE-${index}`,
      dna: seed,
      lineage: { genesisDNA: seed, currentDNA: seed, generation: 1 },
      promptprint: { archetype: `SAMPLE ${index}` },
      visualPreferences: { paletteId: PALETTE_FAMILIES[index % PALETTE_FAMILIES.length].id },
    }));
    digests.add(createHash("sha256").update(renderCreaturePixels(phenotype).pixels).digest("hex"));
  }
  assert.equal(digests.size, 256);
});

test("enforces the premium 64px five-tone material quality floor", () => {
  const phenotype = createPhenotype(fixture());
  const creature = renderCreaturePixels(phenotype);
  const egg = renderEggPixels(phenotype);
  assert.deepEqual([creature.width, creature.height], [64, 64]);
  assert.deepEqual([egg.width, egg.height], [64, 64]);
  assert.equal(phenotype.rendering.renderer, "agentmon-premium-pixel/v1");
  const ramps = createMaterialRamps(phenotype.palette);
  assert.equal(new Set(Object.values(ramps.primary).map((color) => color.join(","))).size, 5);
  const opaqueColors = new Set();
  for (let offset = 0; offset < creature.pixels.length; offset += 4) {
    if (creature.pixels[offset + 3]) opaqueColors.add([...creature.pixels.subarray(offset, offset + 4)].join(","));
  }
  assert.ok(opaqueColors.size >= 14, `premium creature only used ${opaqueColors.size} rendered colors`);
});

test("keeps every base chassis silhouette structurally distinct", () => {
  const masks = new Set();
  for (const body of ["round", "square", "diamond", "bean", "shield", "moth", "orb", "totem", "hopper", "drake"]) {
    const phenotype = createPhenotype(fixture(), { identityOverride: { body, ears: "none", tail: "none", marking: "none", limbs: "hover", stance: "compact" } });
    const surface = renderCreaturePixels(phenotype);
    const mask = Buffer.alloc(surface.width * surface.height);
    for (let index = 0; index < mask.length; index += 1) mask[index] = surface.pixels[index * 4 + 3] ? 1 : 0;
    masks.add(createHash("sha256").update(mask).digest("hex"));
  }
  assert.equal(masks.size, 10);
});

test("renders truthful creature and egg galleries from the same phenotype set", () => {
  const phenotypes = [createPhenotype(fixture()), createPhenotype(fixture({ id: "AGM-5678-EFGH", dna: "DEADBEEF", lineage: { genesisDNA: "DEADBEEF", currentDNA: "DEADBEEF", generation: 1 } }))];
  const creatures = renderPhenotypeGallery(phenotypes, { columns: 2, kind: "creature" });
  const eggs = renderPhenotypeGallery(phenotypes, { columns: 2, kind: "egg" });
  assert.equal(creatures.layout.kind, "creature");
  assert.equal(eggs.layout.kind, "egg");
  assert.notDeepEqual(creatures.png, eggs.png);
});

test("maps the ten-step Pixel Snap gauge from texture-preserving to hard-grid", () => {
  assert.equal(DEFAULT_PIXEL_SNAP_STRENGTH, 4);
  assert.deepEqual(pixelSnapperProfile(1), { engine: "spritefusion-pixel-snapper", version: "1.0.0", license: "MIT", strength: 1, label: "texture-preserving", pixelSize: 1, paletteColors: 256 });
  assert.deepEqual(pixelSnapperProfile(7), { engine: "spritefusion-pixel-snapper", version: "1.0.0", license: "MIT", strength: 7, label: "strong", pixelSize: 3, paletteColors: 96 });
  assert.deepEqual(pixelSnapperProfile(10), { engine: "spritefusion-pixel-snapper", version: "1.0.0", license: "MIT", strength: 10, label: "hard-grid", pixelSize: 6, paletteColors: 48 });
  assert.throws(() => pixelSnapperProfile(0), /1 to 10/);
  assert.throws(() => pixelSnapperProfile(4.5), /1 to 10/);
});

test("ships ninety-six visibly distinct species with a transparent 256-species roadmap", async () => {
  const manifest = curatedVisualManifest();
  assert.equal(manifest.species.length, 96);
  assert.equal(manifest.speciesCount, 96);
  assert.equal(manifest.catalogTargetSpecies, 256);
  assert.equal(manifest.formCount, 3);
  assert.equal(manifest.selectableAppearances, 1152);
  assert.deepEqual(manifest.biomes.map((biome) => biome.id), ["founders-core", "tidal-forge", "riftwild", "mythweave-wilds", "elemental-conflux", "circuitwild-commons"]);
  assert.deepEqual(manifest.biomes.at(-2).affinities, ["fire", "water", "earth", "air"]);
  assert.deepEqual(Object.fromEntries(["fire", "water", "earth", "air"].map((affinity) => [affinity, manifest.species.filter((species) => species.affinity === affinity).length])), { fire: 4, water: 4, earth: 4, air: 4 });
  assert.equal(new Set(manifest.biomes.at(-1).roles).size, 16);
  assert.equal(manifest.pixelSnapper.engine, "spritefusion-pixel-snapper");
  assert.equal(manifest.pixelSnapper.strength, 4);
  assert.equal(manifest.pixelSnapper.pixelSize, 2);
  assert.equal(manifest.pixelSnapper.paletteColors, 160);
  assert.equal(manifest.pixelSnapper.security.status, "verified");
  assert.equal(manifest.pixelSnapper.security.network, "denied");
  assert.equal(manifest.pixelSnapper.security.userHomeRead, "denied");
  assert.equal(manifest.qualityPolicy.pixelGridSnappingRequired, true);
  assert.deepEqual(manifest.evolutionStages.map((stage) => stage.id), ["form-01", "form-02", "form-03"]);
  assert.equal(manifest.morphs.reduce((total, morph) => total + morph.weight, 0), 10_000);
  assert.equal(manifest.qualityPolicy.rawCartesianAssemblyAllowed, false);
  assert.equal(manifest.traitSystem.axes.length, 8);
  assert.equal(new Set(manifest.species.map((species) => species.eyeSystem)).size, 96);
  assert.equal(new Set(manifest.species.map((species) => species.bodyTopology)).size, 96);
  assert.equal((await readdir(join(CURATED_ASSET_ROOT, "species/form-01/forms"))).filter((name) => name.endsWith(".png")).length, 384);
  assert.equal((await readdir(join(CURATED_ASSET_ROOT, "species/forms"))).filter((name) => name.endsWith(".png")).length, 384);
  assert.equal((await readdir(join(CURATED_ASSET_ROOT, "species/form-03/forms"))).filter((name) => name.endsWith(".png")).length, 384);
  assert.equal((await readdir(join(CURATED_ASSET_ROOT, "eggs/forms"))).filter((name) => name.endsWith(".png")).length, 384);
});

test("binds a quality-gated curated form deterministically to genesis DNA", () => {
  const first = createCuratedVisualPlan(fixture());
  const second = createCuratedVisualPlan(fixture());
  assert.deepEqual(first, second);
  assert.equal(verifyCuratedVisualPlan(first), first);
  assert.equal(first.qualityGate.status, "passed");
  assert.equal(first.qualityGate.rawCartesianAssembly, false);
  assert.equal(first.dnaBinding.immutableSpecies, true);
  assert.equal(first.evolution.stage, "form-01");
  assert.match(first.species.creatureAsset, /^species\/form-01\/forms\//);
  assert.ok(first.species.id);
  assert.equal(Object.keys(first.traits).length, 8);
  assert.ok(first.traits.eyeSystem);
  assert.ok(first.individual.markingGene);
  for (const kind of ["creature", "egg"]) {
    const png = renderCuratedVisualPng(first, { kind });
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual(pngDimensions(png), [256, 256], `${kind} curated sprite has the wrong canvas size`);
  }
});

test("advances authored forms only when permanent lineage generations advance", () => {
  const first = createCuratedVisualPlan(fixture());
  const unchanged = advanceCuratedVisualPlan(first, fixture());
  assert.equal(unchanged.evolution.stage, "form-01");
  const second = advanceCuratedVisualPlan(first, fixture({ lineage: { genesisDNA: "1234ABCD", currentDNA: "BEEF0002", generation: 2 } }));
  assert.equal(second.evolution.stage, "form-02");
  assert.match(second.species.creatureAsset, /^species\/forms\//);
  const stillSecond = advanceCuratedVisualPlan(second, fixture({ lineage: { genesisDNA: "1234ABCD", currentDNA: "BEEF0002", generation: 2 } }));
  assert.equal(stillSecond.evolution.stage, "form-02");
  const third = advanceCuratedVisualPlan(second, fixture({ lineage: { genesisDNA: "1234ABCD", currentDNA: "BEEF0003", generation: 3 } }));
  assert.equal(third.evolution.stage, "form-03");
  assert.match(third.species.creatureAsset, /^species\/form-03\/forms\//);
  assert.equal(verifyCuratedVisualPlan(third), third);
});

test("expresses natural populations with common individuals and genuinely rare morphs", () => {
  const counts = { standard: 0, regional: 0, rare: 0, mythic: 0 };
  for (let index = 0; index < 10_000; index += 1) {
    const dna = createHash("sha256").update(`wild-population:${index}`).digest("hex").toUpperCase();
    const plan = createCuratedVisualPlan(fixture({ id: `AGM-WILD-${index}`, dna, lineage: { genesisDNA: dna, currentDNA: dna, generation: 1 } }));
    counts[plan.morph.id] += 1;
  }
  assert.ok(counts.standard >= 8_300 && counts.standard <= 8_700, JSON.stringify(counts));
  assert.ok(counts.regional >= 850 && counts.regional <= 1_150, JSON.stringify(counts));
  assert.ok(counts.rare >= 300 && counts.rare <= 500, JSON.stringify(counts));
  assert.ok(counts.mythic >= 60 && counts.mythic <= 140, JSON.stringify(counts));
});
