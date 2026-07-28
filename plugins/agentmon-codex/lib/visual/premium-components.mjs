import { ellipse, line, polygon, rect, setPixel } from "./raster-primitives.mjs";

function side(phenotype) {
  return phenotype.identity.handedness === "left" ? -1 : 1;
}

export function drawContactShadow(surface, phenotype, ramps) {
  const wide = ["hopper", "moth", "drake"].includes(phenotype.identity.body);
  ellipse(surface, 32, 55, wide ? 24 : 19, 3, ramps.contact);
  rect(surface, wide ? 15 : 19, 54, wide ? 34 : 26, 1, ramps.softInk);
}

export function drawAura(surface, phenotype, ramps) {
  if (phenotype.mutation.aura === "none") return;
  const points = [[7, 12], [55, 9], [4, 36], [58, 38], [31, 4], [13, 49], [51, 50]];
  const count = Math.min(points.length, 2 + phenotype.mutation.generation);
  for (const [x, y] of points.slice(0, count)) {
    rect(surface, x, y, 2, 2, ramps.signal.base);
    setPixel(surface, x + 2, y - 1, ramps.signal.shine);
  }
}

function earPair(surface, kind, ramps) {
  if (kind === "none") return;
  if (kind === "round") {
    ellipse(surface, 18, 15, 6, 6, ramps.ink); ellipse(surface, 46, 15, 6, 6, ramps.ink);
    ellipse(surface, 18, 15, 3, 3, ramps.accent.light); ellipse(surface, 46, 15, 3, 3, ramps.accent.shadow);
  } else if (["point", "horn", "crystal"].includes(kind)) {
    polygon(surface, [[17, 18], [15, 4], [25, 15]], ramps.ink); polygon(surface, [[47, 18], [49, 4], [39, 15]], ramps.ink);
    polygon(surface, [[18, 14], [16, 7], [22, 14]], kind === "crystal" ? ramps.signal.light : ramps.accent.light);
    polygon(surface, [[46, 14], [48, 7], [42, 14]], kind === "crystal" ? ramps.signal.shadow : ramps.accent.shadow);
    if (kind === "horn") { rect(surface, 16, 7, 3, 4, ramps.signal.base); rect(surface, 45, 7, 3, 4, ramps.signal.base); }
  } else if (kind === "antenna") {
    line(surface, 24, 16, 20, 6, ramps.ink, 2); line(surface, 40, 16, 44, 6, ramps.ink, 2);
    ellipse(surface, 20, 5, 4, 4, ramps.ink); ellipse(surface, 44, 5, 4, 4, ramps.ink);
    ellipse(surface, 20, 4, 2, 2, ramps.signal.shine); ellipse(surface, 44, 4, 2, 2, ramps.signal.base);
  } else if (kind === "radar") {
    line(surface, 32, 16, 32, 5, ramps.ink, 2); ellipse(surface, 32, 5, 6, 3, ramps.ink); ellipse(surface, 31, 4, 3, 1, ramps.signal.light);
  } else if (kind === "leaf") {
    polygon(surface, [[22, 17], [7, 7], [17, 4], [27, 14]], ramps.ink); polygon(surface, [[42, 17], [57, 7], [47, 4], [37, 14]], ramps.ink);
    polygon(surface, [[21, 14], [10, 8], [17, 7]], ramps.primary.light); polygon(surface, [[43, 14], [54, 8], [47, 7]], ramps.primary.shadow);
  } else if (kind === "wing") {
    polygon(surface, [[22, 18], [4, 9], [9, 22]], ramps.ink); polygon(surface, [[42, 18], [60, 9], [55, 22]], ramps.ink);
    polygon(surface, [[19, 16], [8, 11], [11, 19]], ramps.accent.light); polygon(surface, [[45, 16], [56, 11], [53, 19]], ramps.accent.shadow);
  } else {
    polygon(surface, [[21, 18], [8, 12], [12, 22]], ramps.ink); polygon(surface, [[43, 18], [56, 12], [52, 22]], ramps.ink);
    polygon(surface, [[19, 17], [11, 14], [13, 19]], ramps.primary.light); polygon(surface, [[45, 17], [53, 14], [51, 19]], ramps.primary.shadow);
  }
}

function tail(surface, phenotype, ramps) {
  const kind = phenotype.identity.tail;
  if (kind === "none") return;
  const direction = side(phenotype);
  const anchor = direction < 0 ? 15 : 49;
  const x = (offset) => anchor + direction * offset;
  line(surface, x(0), 36, x(7), 40, ramps.ink, 4);
  line(surface, x(0), 35, x(7), 39, ramps.accent.shadow, 2);
  if (kind === "cable" || kind === "spring") {
    line(surface, x(7), 40, x(12), 35, ramps.ink, 3); line(surface, x(12), 35, x(16), 39, ramps.ink, 3);
    ellipse(surface, x(18), 38, 4, 4, ramps.ink); ellipse(surface, x(18), 37, 2, 2, ramps.signal.light);
  } else if (kind === "leaf" || kind === "fan") {
    polygon(surface, [[x(6), 40], [x(18), 27], [x(20), 44]], ramps.ink);
    polygon(surface, [[x(9), 39], [x(17), 31], [x(18), 41]], ramps.accent.light);
  } else if (kind === "blade" || kind === "comet") {
    polygon(surface, [[x(6), 40], [x(21), 30], [x(17), 45]], ramps.ink);
    polygon(surface, [[x(10), 39], [x(18), 33], [x(16), 42]], ramps.signal.base);
  } else if (kind === "rune") {
    polygon(surface, [[x(7), 34], [x(16), 31], [x(20), 38], [x(15), 45], [x(7), 42]], ramps.ink);
    rect(surface, Math.min(x(15), x(9)), 35, 7, 5, ramps.signal.base);
  } else {
    ellipse(surface, x(13), 37, kind === "orb" ? 7 : 5, kind === "orb" ? 7 : 5, ramps.ink);
    ellipse(surface, x(13), 36, kind === "orb" ? 4 : 3, kind === "orb" ? 4 : 3, ramps.signal.light);
  }
}

export function drawRearComponents(surface, phenotype, ramps) {
  tail(surface, phenotype, ramps);
  earPair(surface, phenotype.identity.ears, ramps);
}

function foot(surface, x, y, ramps, mirrored = false) {
  polygon(surface, [[x, y], [x + 8, y], [x + (mirrored ? 10 : 9), y + 6], [x - (mirrored ? 1 : 2), y + 6]], ramps.ink);
  rect(surface, x + 1, y + 1, 7, 3, ramps.accent.shadow);
  rect(surface, x + (mirrored ? 1 : 0), y + 4, 9, 2, ramps.signal.deep);
  rect(surface, x + 2, y + 1, 3, 1, ramps.accent.light);
}

export function drawLimbs(surface, phenotype, ramps) {
  const stance = phenotype.identity.stance;
  const left = stance === "wide" ? 10 : stance === "compact" ? 19 : 15;
  const right = stance === "wide" ? 44 : stance === "compact" ? 36 : 40;
  const y = stance === "tall" ? 44 : 46;
  const kind = phenotype.identity.limbs;
  if (kind === "hover") {
    ellipse(surface, left + 5, 53, 7, 3, ramps.ink); ellipse(surface, right + 5, 53, 7, 3, ramps.ink);
    rect(surface, left + 2, 54, 7, 2, ramps.signal.light); rect(surface, right + 2, 54, 7, 2, ramps.signal.base);
    return;
  }
  line(surface, left + 4, y - 4, left + 4, 51, ramps.ink, kind === "spikes" ? 3 : 6);
  line(surface, right + 4, y - 4, right + 4, 51, ramps.ink, kind === "spikes" ? 3 : 6);
  if (kind === "spikes") {
    polygon(surface, [[left, 56], [left + 4, 48], [left + 9, 56]], ramps.accent.shadow);
    polygon(surface, [[right, 56], [right + 4, 48], [right + 9, 56]], ramps.accent.deep);
  } else if (kind === "fins") {
    polygon(surface, [[left - 4, 54], [left + 5, 49], [left + 12, 56]], ramps.ink); polygon(surface, [[right - 3, 56], [right + 4, 49], [right + 13, 54]], ramps.ink);
    rect(surface, left + 1, 53, 8, 2, ramps.accent.light); rect(surface, right, 53, 8, 2, ramps.accent.shadow);
  } else {
    foot(surface, left, 50, ramps); foot(surface, right, 50, ramps, true);
    if (kind === "claws") {
      for (const offset of [0, 4, 8]) { setPixel(surface, left + offset, 57, ramps.signal.shine); setPixel(surface, right + offset, 57, ramps.signal.shine); }
    }
  }
}

export function drawFace(surface, phenotype, faceBox, ramps) {
  const [x, y, width, height] = faceBox;
  const midY = y + Math.floor(height / 2);
  const leftX = x + Math.floor(width * 0.29);
  const rightX = x + Math.floor(width * 0.69);
  const kind = phenotype.identity.eyes;
  if (kind === "visor") {
    rect(surface, x + 3, midY - 2, width - 6, 5, ramps.screen.glow); rect(surface, x + 5, midY - 1, width - 10, 2, ramps.screen.shine);
  } else if (kind === "cyclops") {
    ellipse(surface, x + Math.floor(width / 2), midY, 5, 5, ramps.screen.glow); ellipse(surface, x + Math.floor(width / 2), midY, 2, 2, ramps.screen.deep); setPixel(surface, x + Math.floor(width / 2) - 2, midY - 2, ramps.screen.shine);
  } else if (kind === "sleepy") {
    line(surface, leftX - 3, midY, leftX + 3, midY + 1, ramps.screen.glow, 2); line(surface, rightX - 3, midY + 1, rightX + 3, midY, ramps.screen.glow, 2);
  } else if (kind === "ring") {
    ellipse(surface, leftX, midY, 4, 4, ramps.screen.glow); ellipse(surface, leftX, midY, 2, 2, ramps.screen.deep); ellipse(surface, rightX, midY, 4, 4, ramps.screen.glow); ellipse(surface, rightX, midY, 2, 2, ramps.screen.deep);
  } else if (kind === "star") {
    for (const eyeX of [leftX, rightX]) { rect(surface, eyeX - 1, midY - 4, 3, 9, ramps.screen.glow); rect(surface, eyeX - 4, midY - 1, 9, 3, ramps.screen.glow); setPixel(surface, eyeX, midY - 3, ramps.screen.shine); }
  } else if (kind === "prism") {
    polygon(surface, [[leftX, midY - 4], [leftX + 4, midY + 4], [leftX - 4, midY + 4]], ramps.screen.glow); polygon(surface, [[rightX, midY - 4], [rightX + 4, midY + 4], [rightX - 4, midY + 4]], ramps.screen.shine);
  } else if (kind === "mask") {
    polygon(surface, [[x + 2, midY - 3], [x + width - 2, midY - 3], [x + width - 6, midY + 4], [x + 6, midY + 4]], ramps.accent.deep);
    rect(surface, leftX - 2, midY - 1, 4, 2, ramps.screen.glow); rect(surface, rightX - 2, midY - 1, 4, 2, ramps.screen.glow);
  } else {
    const eyeWidth = kind === "bright" ? 4 : 3;
    rect(surface, leftX - 1, midY - 3, eyeWidth, 7, ramps.screen.glow); rect(surface, rightX - 1, midY - 3, eyeWidth, 7, kind === "split" ? ramps.signal.light : ramps.screen.glow);
    setPixel(surface, leftX, midY - 3, ramps.screen.shine); setPixel(surface, rightX, midY - 3, ramps.screen.shine);
  }
}

export function drawMarkingAndCore(surface, phenotype, ramps) {
  const kind = phenotype.identity.marking;
  if (kind === "stripe") rect(surface, 30, 40, 4, 8, ramps.accent.base);
  else if (kind === "chevron") { line(surface, 23, 42, 32, 48, ramps.accent.light, 2); line(surface, 32, 48, 41, 42, ramps.accent.shadow, 2); }
  else if (kind === "circuit") { line(surface, 20, 43, 28, 43, ramps.accent.base, 2); line(surface, 28, 43, 28, 49, ramps.accent.base, 2); line(surface, 28, 49, 42, 49, ramps.accent.base, 2); }
  else if (kind === "constellation" || kind === "freckles") for (const [x, y] of [[21, 43], [27, 47], [39, 43], [43, 47]]) rect(surface, x, y, 2, 2, ramps.signal.light);
  else if (kind === "split") polygon(surface, [[17, 39], [32, 39], [32, 50], [20, 47]], ramps.accent.shadow);
  else if (kind === "spiral") { line(surface, 23, 44, 41, 44, ramps.accent.base, 2); line(surface, 41, 44, 41, 50, ramps.accent.base, 2); line(surface, 41, 50, 28, 50, ramps.accent.base, 2); }
  else if (kind === "patch") { rect(surface, 20, 42, 9, 6, ramps.accent.shadow); rect(surface, 38, 45, 5, 4, ramps.signal.base); }

  const glyph = phenotype.identity.coreGlyph;
  const cx = 32;
  const cy = 44;
  if (["diamond", "seed"].includes(glyph)) polygon(surface, [[cx, cy - 4], [cx + 4, cy], [cx, cy + 4], [cx - 4, cy]], ramps.signal.shine);
  else if (glyph === "loop") { ellipse(surface, cx, cy, 5, 4, ramps.signal.base); ellipse(surface, cx, cy, 2, 2, ramps.ink); }
  else if (glyph === "bolt") polygon(surface, [[cx + 1, cy - 5], [cx - 4, cy + 1], [cx, cy + 1], [cx - 1, cy + 6], [cx + 5, cy - 1], [cx + 1, cy - 1]], ramps.signal.shine);
  else if (glyph === "moon") { ellipse(surface, cx, cy, 5, 5, ramps.signal.light); ellipse(surface, cx + 3, cy - 2, 4, 4, ramps.primary.shadow); }
  else { rect(surface, cx - 1, cy - 5, 3, 10, ramps.signal.base); rect(surface, cx - 5, cy - 1, 10, 3, ramps.signal.base); }
}

export function drawEquipment(surface, phenotype, ramps) {
  for (const item of phenotype.equipment ?? []) {
    if (item.slot === "crown") polygon(surface, [[23, 16], [22, 9], [28, 13], [32, 7], [36, 13], [42, 9], [41, 16]], ramps.signal.base);
    else if (item.slot === "pack") { rect(surface, 48, 28, 9, 16, ramps.ink); rect(surface, 50, 30, 5, 10, ramps.accent.shadow); rect(surface, 50, 30, 3, 2, ramps.accent.light); }
    else if (item.slot === "focus-lens") { ellipse(surface, 42, 31, 7, 7, ramps.signal.base); ellipse(surface, 42, 31, 4, 4, ramps.ink); setPixel(surface, 40, 29, ramps.signal.shine); }
    else if (item.slot === "tool-band") { rect(surface, 9, 42, 11, 5, ramps.signal.deep); rect(surface, 11, 42, 5, 2, ramps.signal.light); }
    else if (item.slot === "map-ribbon") { polygon(surface, [[17, 37], [23, 40], [21, 52], [16, 49]], ramps.accent.base); rect(surface, 17, 47, 4, 2, ramps.signal.light); }
    else if (item.slot === "shield-node") { polygon(surface, [[50, 35], [58, 39], [56, 49], [50, 54], [44, 49], [42, 39]], ramps.ink); polygon(surface, [[50, 38], [55, 40], [54, 47], [50, 51], [46, 47], [45, 40]], ramps.signal.shadow); }
  }
}

export function drawCrest(surface, phenotype, ramps) {
  const size = phenotype.mutation.crestSize;
  for (let index = 0; index < size; index += 1) {
    const x = 26 + index * 6;
    polygon(surface, [[x, 16], [x + 3, 5 - index], [x + 6, 16]], ramps.ink);
    polygon(surface, [[x + 2, 14], [x + 3, 8 - index], [x + 4, 14]], ramps.signal.light);
  }
}
