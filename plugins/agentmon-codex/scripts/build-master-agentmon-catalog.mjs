import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { speciesFieldGuide } from "../lib/visual/species-lore.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const visualRoot = resolve(projectRoot, "plugins/agentmon-codex/assets/visual-v4");
export const MASTER_CATALOG_ROOT = resolve(projectRoot, "agentmon-native-prototype/ui/assets/agentmon-master-catalog");

const STAGES = [
  { id: "egg", label: "Egg", source: "eggs/forms" },
  { id: "form-01", label: "Form I", source: "species/form-01/forms" },
  { id: "form-02", label: "Form II", source: "species/forms" },
  { id: "form-03", label: "Form III", source: "species/form-03/forms" },
];

async function auditSprite(path, label) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 256 || info.height !== 256) throw new Error(`${label} is ${info.width}x${info.height}; expected 256x256.`);
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha < 24) continue;
      opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!opaquePixels) throw new Error(`${label} is empty.`);
  const padding = { left: minX, top: minY, right: info.width - 1 - maxX, bottom: info.height - 1 - maxY };
  const minimumPadding = Math.min(...Object.values(padding));
  if (minimumPadding < 1) throw new Error(`${label} touches an outer edge and may be clipped.`);
  return {
    width: info.width,
    height: info.height,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    padding,
    minimumPadding,
    edgeSafe: true,
  };
}

function biomeFor(manifest, speciesId) {
  return manifest.biomes.find((biome) => biome.species.includes(speciesId));
}

export async function buildMasterAgentmonCatalog() {
  const manifest = JSON.parse(await readFile(resolve(visualRoot, "manifest.json"), "utf8"));
  const stagingRoot = `${MASTER_CATALOG_ROOT}.staging`;
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  const audit = [];
  const speciesCatalog = [];

  for (const [speciesIndex, species] of manifest.species.entries()) {
    const biome = biomeFor(manifest, species.id);
    if (!biome) throw new Error(`${species.id} is not assigned to a biome.`);
    const entry = {
      ...species,
      biome: { id: biome.id, name: biome.name },
      fieldGuide: speciesFieldGuide(species, biome, speciesIndex),
      appearances: {},
    };
    for (const stage of STAGES) {
      entry.appearances[stage.id] = {};
      for (const morph of manifest.morphs) {
        const fileName = `${species.id}-${morph.id}.png`;
        const source = resolve(visualRoot, stage.source, fileName);
        const relativeDestination = `${biome.id}/${species.id}/${stage.id}/${morph.id}.png`;
        const destination = resolve(stagingRoot, relativeDestination);
        await mkdir(dirname(destination), { recursive: true });
        const result = await auditSprite(source, `${species.id}/${stage.id}/${morph.id}`);
        await copyFile(source, destination);
        entry.appearances[stage.id][morph.id] = `./assets/agentmon-master-catalog/${relativeDestination}`;
        audit.push({ speciesId: species.id, biomeId: biome.id, stage: stage.id, morph: morph.id, ...result });
      }
    }
    speciesCatalog.push(entry);
  }

  const catalog = {
    format: "agentmon.master-catalog/v1",
    generatedFrom: manifest.id,
    speciesCount: speciesCatalog.length,
    evolutionFormCount: 3,
    morphCount: manifest.morphs.length,
    agentmonAppearanceCount: speciesCatalog.length * 3 * manifest.morphs.length,
    eggAppearanceCount: speciesCatalog.length * manifest.morphs.length,
    totalSpriteCount: audit.length,
    sheetIndependent: true,
    edgeSafe: audit.every((item) => item.edgeSafe),
    stages: STAGES.map(({ id, label }) => ({ id, label })),
    morphs: manifest.morphs,
    biomes: manifest.biomes.map(({ id, name, species: biomeSpecies }) => ({ id, name, speciesCount: biomeSpecies.length })),
    species: speciesCatalog,
  };
  await writeFile(resolve(stagingRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  await writeFile(resolve(stagingRoot, "sprite-audit.json"), `${JSON.stringify({ format: "agentmon.sprite-audit/v1", edgeSafe: catalog.edgeSafe, sprites: audit }, null, 2)}\n`);
  await writeFile(resolve(stagingRoot, "README.md"), `# Agentmon Master Catalog\n\nThis is the canonical, sheet-independent browser catalog. It contains ${catalog.speciesCount} species, ${catalog.agentmonAppearanceCount} Agentmon form appearances, and ${catalog.eggAppearanceCount} egg appearances. Every PNG is a transparent 256x256 production sprite and passed the outer-edge clipping audit.\n`);
  await rm(MASTER_CATALOG_ROOT, { recursive: true, force: true });
  await mkdir(dirname(MASTER_CATALOG_ROOT), { recursive: true });
  await rename(stagingRoot, MASTER_CATALOG_ROOT);
  return { root: MASTER_CATALOG_ROOT, catalog };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildMasterAgentmonCatalog()
    .then(({ root, catalog }) => process.stdout.write(`${JSON.stringify({ root, species: catalog.speciesCount, agentmonAppearances: catalog.agentmonAppearanceCount, eggs: catalog.eggAppearanceCount, sprites: catalog.totalSpriteCount, edgeSafe: catalog.edgeSafe }, null, 2)}\n`))
    .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
