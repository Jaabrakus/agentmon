import { createMaterialRamps } from "./material-ramp.mjs";
import { drawChassis } from "./premium-chassis.mjs";
import {
  drawAura,
  drawContactShadow,
  drawCrest,
  drawEquipment,
  drawFace,
  drawLimbs,
  drawMarkingAndCore,
  drawRearComponents,
} from "./premium-components.mjs";
import { createSurface, ellipse, encodePng, line, polygon, rect, setPixel } from "./raster-primitives.mjs";

export const PREMIUM_LOGICAL_GRID = 64;
export const PREMIUM_RENDERER = "agentmon-premium-pixel/v1";

export function renderCreaturePixels(phenotype) {
  const surface = createSurface(PREMIUM_LOGICAL_GRID, PREMIUM_LOGICAL_GRID);
  const ramps = createMaterialRamps(phenotype.palette);
  drawAura(surface, phenotype, ramps);
  drawContactShadow(surface, phenotype, ramps);
  drawRearComponents(surface, phenotype, ramps);
  const faceBox = drawChassis(surface, phenotype, ramps);
  drawFace(surface, phenotype, faceBox, ramps);
  drawMarkingAndCore(surface, phenotype, ramps);
  drawLimbs(surface, phenotype, ramps);
  drawEquipment(surface, phenotype, ramps);
  drawCrest(surface, phenotype, ramps);
  return surface;
}

function eggGlyph(surface, phenotype, ramps) {
  const kind = phenotype.identity.coreGlyph;
  if (kind === "diamond" || kind === "seed") polygon(surface, [[32, 27], [39, 34], [32, 41], [25, 34]], ramps.signal.light);
  else if (kind === "loop") { ellipse(surface, 32, 34, 8, 7, ramps.signal.base); ellipse(surface, 32, 34, 4, 3, ramps.ink); }
  else if (kind === "moon") { ellipse(surface, 32, 34, 8, 8, ramps.signal.light); ellipse(surface, 36, 31, 7, 7, ramps.primary.shadow); }
  else if (kind === "bolt") polygon(surface, [[34, 24], [25, 35], [31, 35], [29, 45], [40, 32], [34, 32]], ramps.signal.shine);
  else { rect(surface, 30, 25, 5, 18, ramps.signal.base); rect(surface, 23, 32, 19, 5, ramps.signal.base); }
}

export function renderEggPixels(phenotype) {
  const surface = createSurface(PREMIUM_LOGICAL_GRID, PREMIUM_LOGICAL_GRID);
  const ramps = createMaterialRamps(phenotype.palette);
  ellipse(surface, 32, 55, 18, 3, ramps.contact);
  ellipse(surface, 32, 33, 19, 25, ramps.ink);
  ellipse(surface, 32, 32, 16, 22, ramps.primary.shadow);
  ellipse(surface, 28, 27, 12, 17, ramps.primary.light);
  polygon(surface, [[16, 33], [23, 27], [30, 34], [38, 24], [48, 33], [46, 44], [19, 44]], ramps.accent.shadow);
  polygon(surface, [[18, 32], [23, 29], [30, 36], [38, 27], [45, 33], [43, 37], [20, 37]], ramps.accent.light);
  rect(surface, 20, 44, 24, 5, ramps.primary.deep);
  line(surface, 22, 17, 29, 12, ramps.primary.shine, 2);
  setPixel(surface, 24, 15, ramps.paper);
  eggGlyph(surface, phenotype, ramps);
  return surface;
}

export { encodePng } from "./raster-primitives.mjs";

export function renderPhenotypePng(phenotype, options = {}) {
  const kind = options.kind ?? "creature";
  const surface = kind === "egg" ? renderEggPixels(phenotype) : renderCreaturePixels(phenotype);
  return encodePng(surface, options.scale ?? phenotype.rendering?.pixelScale ?? 2);
}
