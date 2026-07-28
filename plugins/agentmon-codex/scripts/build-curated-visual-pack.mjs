#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const assetRoot = resolve(pluginRoot, "assets/visual-v3");

export const CURATED_FAMILIES = [
  { id: "archive", name: "Archive Familiar", creature: "archive.png", egg: "archive.png", silhouette: "compact", locomotion: "biped" },
  { id: "lens", name: "Lens Crawler", creature: "lens.png", egg: "lens.png", silhouette: "round", locomotion: "quadruped" },
  { id: "prism", name: "Prism Monk", creature: "prism.png", egg: "prism.png", silhouette: "triangular", locomotion: "biped" },
  { id: "compass", name: "Compass Drake", creature: "compass.png", egg: "compass.png", silhouette: "long-neck", locomotion: "quadruped" },
  { id: "core", name: "Core Wisp", creature: "core.png", egg: "core.png", silhouette: "floating", locomotion: "hover" },
  { id: "relay", name: "Relay Jelly", creature: "relay.png", egg: "relay.png", silhouette: "round", locomotion: "tentacle" },
  { id: "beacon", name: "Beacon Beetle", creature: "beacon.png", egg: "beacon.png", silhouette: "low-armored", locomotion: "hexapod" },
  { id: "orbit", name: "Orbit Moth", creature: "orbit.png", egg: "orbit.png", silhouette: "winged", locomotion: "hover" },
  { id: "vault", name: "Vault Tortoise", creature: "vault.png", egg: "vault.png", silhouette: "domed", locomotion: "quadruped" },
  { id: "signal", name: "Signal Fox", creature: "signal.png", egg: "signal.png", silhouette: "agile", locomotion: "quadruped" },
  { id: "rune", name: "Rune Serpent", creature: "rune.png", egg: "rune.png", silhouette: "coiled", locomotion: "serpentine" },
  { id: "forge", name: "Forge Crab", creature: "forge.png", egg: "forge.png", silhouette: "broad", locomotion: "hexapod" },
  { id: "scout", name: "Scout Rabbit", creature: "scout.png", egg: "scout.png", silhouette: "tall-eared", locomotion: "biped" },
  { id: "oracle", name: "Oracle Owl", creature: "oracle.png", egg: "oracle.png", silhouette: "winged-round", locomotion: "hover" },
  { id: "kernel", name: "Kernel Golem", creature: "kernel.png", egg: "kernel.png", silhouette: "humanoid", locomotion: "biped" },
  { id: "echo", name: "Echo Bat", creature: "echo.png", egg: "echo.png", silhouette: "winged-sonar", locomotion: "hover" },
];

export const CURATED_COLORWAYS = [
  { id: "heritage", hue: 0, saturation: 1, brightness: 1 },
  { id: "sunrise", hue: 18, saturation: 1.04, brightness: 1.02 },
  { id: "amber", hue: 38, saturation: 1.02, brightness: 1 },
  { id: "lime", hue: 68, saturation: 0.96, brightness: 1.02 },
  { id: "verdant", hue: 96, saturation: 0.98, brightness: 0.98 },
  { id: "jade", hue: 126, saturation: 1.02, brightness: 0.98 },
  { id: "aqua", hue: 154, saturation: 1.04, brightness: 1.02 },
  { id: "cobalt", hue: 184, saturation: 1.05, brightness: 0.98 },
  { id: "indigo", hue: 210, saturation: 1.02, brightness: 0.96 },
  { id: "violet", hue: 232, saturation: 1.04, brightness: 0.98 },
  { id: "plum", hue: 254, saturation: 1, brightness: 0.96 },
  { id: "rose", hue: 282, saturation: 1.02, brightness: 1 },
  { id: "coral", hue: 318, saturation: 1.04, brightness: 1.02 },
  { id: "nocturne", hue: 222, saturation: 0.82, brightness: 0.78 },
  { id: "pastel", hue: 0, saturation: 0.62, brightness: 1.12 },
  { id: "hologram", hue: 168, saturation: 0.68, brightness: 1.1 },
];

export const SPECIES_MORPHS = [
  { id: "standard", rarity: "common", weight: 8500 },
  { id: "regional", rarity: "uncommon", weight: 1000 },
  { id: "rare", rarity: "rare", weight: 400 },
  { id: "mythic", rarity: "mythic", weight: 100 },
];

const SPECIES_PALETTES = [
  ["heritage", "cobalt", "nocturne", "hologram"], ["heritage", "amber", "pastel", "hologram"],
  ["heritage", "violet", "nocturne", "hologram"], ["heritage", "jade", "pastel", "hologram"],
  ["heritage", "aqua", "nocturne", "hologram"], ["heritage", "plum", "pastel", "hologram"],
  ["heritage", "amber", "nocturne", "hologram"], ["heritage", "rose", "pastel", "hologram"],
  ["heritage", "verdant", "nocturne", "hologram"], ["heritage", "coral", "pastel", "hologram"],
  ["heritage", "jade", "nocturne", "hologram"], ["heritage", "sunrise", "pastel", "hologram"],
  ["heritage", "lime", "nocturne", "hologram"], ["heritage", "cobalt", "pastel", "hologram"],
  ["heritage", "indigo", "nocturne", "hologram"], ["heritage", "violet", "pastel", "hologram"],
];

const FOUNDING_SPECIES = CURATED_FAMILIES.map((family, index) => ({
  ...family,
  standardColorway: SPECIES_PALETTES[index][0],
  regionalColorway: SPECIES_PALETTES[index][1],
  rareColorway: SPECIES_PALETTES[index][2],
  mythicColorway: SPECIES_PALETTES[index][3],
}));

const FIRST_IDS = CURATED_FAMILIES.slice(0, 6).map((family) => family.id);
const SECOND_IDS = CURATED_FAMILIES.slice(6, 11).map((family) => family.id);
const THIRD_IDS = CURATED_FAMILIES.slice(11, 16).map((family) => family.id);

async function sliceGrid(source, destination, ids) {
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not inspect curated source atlas: ${source}`);
  const cellWidth = Math.floor(metadata.width / 3);
  const cellHeight = Math.floor(metadata.height / 2);
  await mkdir(destination, { recursive: true });
  for (const [index, id] of ids.entries()) {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const left = column * cellWidth;
    const top = row * cellHeight;
    const width = column === 2 ? metadata.width - left : cellWidth;
    const height = row === 1 ? metadata.height - top : cellHeight;
    const marginX = Math.max(8, Math.floor(width * 0.04));
    const marginY = Math.max(8, Math.floor(height * 0.025));
    const cell = await sharp(source).extract({ left: left + marginX, top: top + marginY, width: width - marginX * 2, height: height - marginY * 2 }).png().toBuffer();
    const cleanedCell = await removeAtlasIntrusions(cell);
    const sprite = await sharp(cleanedCell)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(236, 236, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    await validateSprite(sprite, `${source}#${id}`);
    await writeFile(resolve(destination, `${id}.png`), sprite);
  }
}

async function removeAtlasIntrusions(cell) {
  const { data, info } = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const components = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || data[start * info.channels + 3] <= 16) continue;
    const stack = [start];
    const pixels = [];
    let touchesBorder = false;
    visited[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      pixels.push(index);
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) touchesBorder = true;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (!visited[next] && data[next * info.channels + 3] > 16) { visited[next] = 1; stack.push(next); }
      }
    }
    components.push({ pixels, touchesBorder });
  }
  components.sort((a, b) => b.pixels.length - a.pixels.length);
  const largest = components[0]?.pixels.length ?? 0;
  for (const component of components) {
    const discard = component !== components[0] && (component.touchesBorder || component.pixels.length < Math.max(24, largest * 0.002));
    if (!discard) continue;
    for (const index of component.pixels) data[index * info.channels + 3] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function validateSprite(sprite, label) {
  const { data, info } = await sharp(sprite).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  const colors = new Set();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const alpha = data[offset + 3];
      if ((x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) && alpha !== 0) throw new Error(`Curated sprite touches its border: ${label}`);
      if (alpha > 16) opaque += 1;
      if (alpha > 220) colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
  }
  const coverage = opaque / (info.width * info.height);
  if (coverage < 0.04 || coverage > 0.72) throw new Error(`Curated sprite has invalid coverage ${coverage.toFixed(3)}: ${label}`);
  if (colors.size < 24) throw new Error(`Curated sprite lacks material depth (${colors.size} colors): ${label}`);
}

async function buildColorways(kind) {
  const baseDir = resolve(assetRoot, kind);
  const formDir = resolve(baseDir, "forms");
  await mkdir(formDir, { recursive: true });
  for (const family of CURATED_FAMILIES) {
    const base = resolve(baseDir, `${family.id}.png`);
    for (const colorway of CURATED_COLORWAYS) {
      const pipeline = sharp(base);
      if (colorway.id !== "heritage") pipeline.modulate({ hue: colorway.hue, saturation: colorway.saturation, brightness: colorway.brightness });
      await pipeline.png({ compressionLevel: 9, palette: false }).toFile(resolve(formDir, `${family.id}-${colorway.id}.png`));
    }
  }
}

export async function buildCuratedVisualPack() {
  await sliceGrid(resolve(assetRoot, "sources/creature-families-alpha.png"), resolve(assetRoot, "creatures"), FIRST_IDS);
  await sliceGrid(resolve(assetRoot, "sources/egg-families-alpha.png"), resolve(assetRoot, "eggs"), FIRST_IDS);
  await sliceGrid(resolve(assetRoot, "sources/creature-families-07-11-alpha.png"), resolve(assetRoot, "creatures"), SECOND_IDS);
  await sliceGrid(resolve(assetRoot, "sources/egg-families-07-11-alpha.png"), resolve(assetRoot, "eggs"), SECOND_IDS);
  await sliceGrid(resolve(assetRoot, "sources/creature-families-12-16-alpha.png"), resolve(assetRoot, "creatures"), THIRD_IDS);
  await sliceGrid(resolve(assetRoot, "sources/egg-families-12-16-alpha.png"), resolve(assetRoot, "eggs"), THIRD_IDS);
  await Promise.all([buildColorways("creatures"), buildColorways("eggs")]);
  const manifest = {
    format: "agentmon.curated-visual-pack/v1",
    id: "core-founders-v1",
    renderer: "agentmon-curated-atlas/v3",
    artDirection: "reference-authored-mint-purple-gold",
    grid: { spriteWidth: 256, spriteHeight: 256 },
    species: FOUNDING_SPECIES,
    speciesCount: FOUNDING_SPECIES.length,
    catalogTargetSpecies: 256,
    morphs: SPECIES_MORPHS,
    authoringColorways: CURATED_COLORWAYS,
    selectableAppearances: FOUNDING_SPECIES.length * SPECIES_MORPHS.length,
    qualityPolicy: {
      rawCartesianAssemblyAllowed: false,
      authoredSilhouettesRequired: true,
      compatibilityValidated: true,
      runtimeGenerativeImageCalls: false,
      transparentBorderRequired: true,
      minimumOpaqueColors: 24,
      opaqueCoverageRange: [0.04, 0.72],
    },
    privacy: { rawPromptsIncluded: false, localAssetsOnly: true },
  };
  await writeFile(resolve(assetRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { assetRoot, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCuratedVisualPack().then(({ assetRoot, manifest }) => {
    process.stdout.write(`${JSON.stringify({ assetRoot, pack: manifest.id, foundingSpecies: manifest.speciesCount, speciesTarget: manifest.catalogTargetSpecies, morphs: manifest.morphs.length, selectableAppearances: manifest.selectableAppearances }, null, 2)}\n`);
  }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
