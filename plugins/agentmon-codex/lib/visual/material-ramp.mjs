function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function rgba(value, alpha = 255) {
  return [...(Array.isArray(value) ? value.slice(0, 3) : rgb(value)), alpha];
}

function mix(left, right, amount) {
  const a = Array.isArray(left) ? left : rgb(left);
  const b = Array.isArray(right) ? right : rgb(right);
  return a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
}

function ramp(base, ink, paper) {
  return {
    deep: rgba(mix(base, ink, 0.72)),
    shadow: rgba(mix(base, ink, 0.42)),
    base: rgba(base),
    light: rgba(mix(base, paper, 0.34)),
    shine: rgba(mix(base, paper, 0.68)),
  };
}

export function createMaterialRamps(palette) {
  const ink = rgba(palette.ink);
  const paper = rgba(palette.paper);
  return {
    ink,
    softInk: rgba(mix(palette.ink, palette.primary, 0.18)),
    paper,
    primary: ramp(palette.primary, palette.ink, palette.paper),
    accent: ramp(palette.accent, palette.ink, palette.paper),
    signal: ramp(palette.signal, palette.ink, palette.paper),
    screen: {
      deep: rgba(mix(palette.ink, "#020817", 0.7)),
      base: rgba(mix(palette.ink, palette.accent, 0.12)),
      glow: rgba(mix(palette.signal, "#7FFFF0", 0.48)),
      shine: rgba(mix(palette.paper, "#AFFFF4", 0.5)),
    },
    contact: rgba(palette.ink, 82),
  };
}
