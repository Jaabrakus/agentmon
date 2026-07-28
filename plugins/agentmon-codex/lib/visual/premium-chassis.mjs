import { ellipse, line, polygon, rect, setPixel } from "./raster-primitives.mjs";

function panel(surface, box, ramps) {
  const [x, y, width, height] = box;
  rect(surface, x - 2, y - 2, width + 4, height + 4, ramps.ink);
  rect(surface, x, y, width, height, ramps.screen.deep);
  rect(surface, x + 2, y + 1, width - 4, 2, ramps.screen.base);
  setPixel(surface, x + 1, y + 1, ramps.screen.shine);
}

function roundChassis(surface, ramps) {
  ellipse(surface, 32, 33, 20, 18, ramps.ink);
  ellipse(surface, 32, 32, 18, 16, ramps.primary.shadow);
  ellipse(surface, 29, 28, 15, 12, ramps.primary.base);
  ellipse(surface, 26, 24, 9, 5, ramps.primary.light);
  rect(surface, 14, 34, 35, 7, ramps.primary.deep);
  rect(surface, 16, 34, 31, 3, ramps.primary.shadow);
  rect(surface, 17, 30, 3, 8, ramps.accent.base);
  rect(surface, 44, 29, 3, 9, ramps.accent.shadow);
  return [21, 24, 22, 14];
}

function archiveChassis(surface, ramps) {
  polygon(surface, [[15, 19], [20, 14], [47, 14], [51, 19], [51, 42], [46, 47], [18, 47], [13, 42], [13, 21]], ramps.ink);
  polygon(surface, [[17, 20], [21, 17], [46, 17], [48, 20], [48, 40], [44, 44], [20, 44], [16, 40]], ramps.primary.shadow);
  polygon(surface, [[18, 20], [22, 18], [45, 18], [47, 20], [47, 31], [18, 31]], ramps.primary.light);
  rect(surface, 17, 35, 31, 6, ramps.primary.deep);
  rect(surface, 18, 41, 29, 2, ramps.accent.shadow);
  rect(surface, 18, 19, 3, 18, ramps.primary.shine);
  rect(surface, 47, 23, 3, 14, ramps.accent.deep);
  return [20, 23, 25, 15];
}

function prismChassis(surface, ramps) {
  polygon(surface, [[32, 7], [52, 38], [46, 49], [18, 49], [12, 38]], ramps.ink);
  polygon(surface, [[32, 11], [48, 38], [44, 46], [20, 46], [16, 38]], ramps.primary.shadow);
  polygon(surface, [[32, 12], [39, 25], [25, 25]], ramps.primary.shine);
  polygon(surface, [[18, 37], [27, 18], [27, 44], [20, 44]], ramps.primary.light);
  polygon(surface, [[38, 17], [48, 38], [44, 44], [38, 31]], ramps.accent.shadow);
  polygon(surface, [[29, 11], [34, 11], [38, 18], [25, 18]], ramps.signal.base);
  return [24, 26, 17, 14];
}

function beanChassis(surface, ramps) {
  polygon(surface, [[27, 12], [39, 13], [49, 22], [50, 38], [43, 48], [27, 50], [16, 44], [13, 30], [17, 18]], ramps.ink);
  polygon(surface, [[28, 15], [38, 16], [46, 23], [47, 37], [41, 45], [28, 47], [19, 42], [16, 30], [20, 20]], ramps.primary.shadow);
  polygon(surface, [[27, 16], [37, 17], [43, 22], [22, 37], [18, 31], [21, 21]], ramps.primary.light);
  polygon(surface, [[43, 24], [47, 29], [46, 39], [39, 45], [35, 43]], ramps.accent.deep);
  rect(surface, 17, 33, 4, 8, ramps.primary.deep);
  return [20, 24, 23, 14];
}

function shieldChassis(surface, ramps) {
  polygon(surface, [[16, 15], [48, 15], [52, 22], [48, 40], [32, 52], [16, 40], [12, 22]], ramps.ink);
  polygon(surface, [[18, 18], [46, 18], [49, 23], [45, 38], [32, 48], [19, 38], [15, 23]], ramps.primary.shadow);
  polygon(surface, [[19, 19], [32, 19], [32, 45], [20, 37], [16, 24]], ramps.primary.light);
  polygon(surface, [[32, 19], [45, 19], [48, 24], [44, 37], [32, 46]], ramps.primary.deep);
  line(surface, 32, 18, 32, 47, ramps.accent.base, 2);
  rect(surface, 17, 20, 4, 15, ramps.primary.shine);
  return [21, 23, 22, 14];
}

function mothChassis(surface, ramps) {
  polygon(surface, [[25, 21], [9, 14], [4, 22], [11, 42], [25, 38]], ramps.ink);
  polygon(surface, [[39, 21], [55, 14], [60, 22], [53, 42], [39, 38]], ramps.ink);
  polygon(surface, [[23, 24], [10, 18], [8, 22], [13, 37], [25, 34]], ramps.accent.shadow);
  polygon(surface, [[41, 24], [54, 18], [57, 22], [51, 37], [39, 34]], ramps.accent.deep);
  polygon(surface, [[10, 18], [21, 24], [14, 27]], ramps.accent.light);
  polygon(surface, [[54, 18], [43, 24], [50, 27]], ramps.accent.base);
  ellipse(surface, 32, 32, 11, 19, ramps.ink);
  ellipse(surface, 32, 31, 8, 16, ramps.primary.shadow);
  ellipse(surface, 29, 25, 5, 9, ramps.primary.light);
  rect(surface, 27, 40, 10, 5, ramps.primary.deep);
  return [25, 25, 14, 13];
}

function orbChassis(surface, ramps) {
  ellipse(surface, 32, 32, 21, 20, ramps.ink);
  ellipse(surface, 32, 31, 18, 17, ramps.primary.shadow);
  ellipse(surface, 28, 26, 13, 11, ramps.primary.light);
  ellipse(surface, 29, 24, 8, 6, ramps.primary.shine);
  rect(surface, 12, 31, 40, 5, ramps.accent.deep);
  rect(surface, 15, 31, 34, 2, ramps.accent.light);
  ellipse(surface, 32, 32, 7, 7, ramps.signal.deep);
  ellipse(surface, 32, 32, 4, 4, ramps.signal.base);
  return [20, 20, 24, 14];
}

function totemChassis(surface, ramps) {
  polygon(surface, [[25, 7], [40, 7], [46, 15], [45, 45], [39, 51], [24, 51], [18, 45], [19, 15]], ramps.ink);
  polygon(surface, [[27, 10], [38, 10], [43, 16], [42, 43], [37, 48], [26, 48], [21, 43], [22, 16]], ramps.primary.shadow);
  polygon(surface, [[27, 11], [34, 11], [32, 47], [25, 46], [23, 42], [24, 16]], ramps.primary.light);
  polygon(surface, [[36, 11], [41, 16], [40, 43], [35, 47]], ramps.primary.deep);
  rect(surface, 20, 36, 23, 4, ramps.accent.deep);
  rect(surface, 22, 36, 19, 2, ramps.accent.light);
  return [24, 19, 17, 15];
}

function hopperChassis(surface, ramps) {
  polygon(surface, [[13, 24], [20, 17], [44, 17], [52, 24], [55, 38], [48, 45], [16, 45], [9, 38]], ramps.ink);
  polygon(surface, [[15, 25], [21, 20], [43, 20], [49, 25], [52, 37], [46, 42], [18, 42], [12, 37]], ramps.primary.shadow);
  polygon(surface, [[17, 25], [23, 21], [42, 21], [47, 25], [46, 31], [15, 31]], ramps.primary.light);
  rect(surface, 13, 34, 39, 6, ramps.primary.deep);
  polygon(surface, [[12, 36], [3, 44], [18, 42]], ramps.accent.shadow);
  polygon(surface, [[52, 36], [61, 44], [46, 42]], ramps.accent.deep);
  return [20, 25, 25, 13];
}

function drakeChassis(surface, ramps) {
  ellipse(surface, 27, 38, 17, 12, ramps.ink);
  ellipse(surface, 27, 36, 14, 9, ramps.primary.shadow);
  ellipse(surface, 24, 33, 10, 6, ramps.primary.light);
  polygon(surface, [[34, 36], [37, 17], [43, 11], [51, 14], [53, 23], [47, 29], [43, 42]], ramps.ink);
  polygon(surface, [[37, 35], [40, 19], [44, 14], [49, 16], [50, 22], [45, 27], [41, 40]], ramps.primary.shadow);
  polygon(surface, [[40, 25], [42, 18], [45, 15], [45, 27]], ramps.primary.light);
  polygon(surface, [[14, 34], [4, 26], [8, 41]], ramps.accent.shadow);
  return [40, 16, 10, 9];
}

const DRAWERS = { round: roundChassis, square: archiveChassis, diamond: prismChassis, bean: beanChassis, shield: shieldChassis, moth: mothChassis, orb: orbChassis, totem: totemChassis, hopper: hopperChassis, drake: drakeChassis };

export function drawChassis(surface, phenotype, ramps) {
  const faceBox = (DRAWERS[phenotype.identity.body] ?? roundChassis)(surface, ramps);
  panel(surface, faceBox, ramps);
  return faceBox;
}
