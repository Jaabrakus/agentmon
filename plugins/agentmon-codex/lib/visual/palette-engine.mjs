export const PALETTE_FORMAT = "agentmon.palette/v1";

export const PALETTE_FAMILIES = [
  { id: "mint-arcade", mood: "inventive", ink: "#17233C", paper: "#FFF4D6", primary: "#43C98B", accent: "#7756C9", signal: "#F4C542" },
  { id: "coral-signal", mood: "bold", ink: "#20253D", paper: "#FFF1D8", primary: "#FF7262", accent: "#536DD8", signal: "#FFD04D" },
  { id: "violet-orbit", mood: "mystic", ink: "#1B1835", paper: "#F7EFFF", primary: "#8E63D2", accent: "#50C5B7", signal: "#FFCB55" },
  { id: "cobalt-lab", mood: "precise", ink: "#12233F", paper: "#EAF6FF", primary: "#3978D4", accent: "#53C7A2", signal: "#FFCA3A" },
  { id: "amber-forge", mood: "driven", ink: "#2D2130", paper: "#FFF0CE", primary: "#EFAF32", accent: "#D95D73", signal: "#7AD9C0" },
  { id: "moss-library", mood: "wise", ink: "#1D302A", paper: "#F2EACB", primary: "#5D9B63", accent: "#B96C5D", signal: "#E8BD47" },
  { id: "rose-circuit", mood: "social", ink: "#30213A", paper: "#FFF0F3", primary: "#E76F9A", accent: "#7067CF", signal: "#56C9B0" },
  { id: "aqua-radar", mood: "curious", ink: "#12313A", paper: "#E9FFF9", primary: "#36B8C8", accent: "#F07862", signal: "#F2C94C" },
  { id: "lime-terminal", mood: "technical", ink: "#142820", paper: "#F0FFD7", primary: "#7CCB45", accent: "#4D78CF", signal: "#F5B942" },
  { id: "plum-nocturne", mood: "reflective", ink: "#24172F", paper: "#F8E9D8", primary: "#8D4E8D", accent: "#D66B62", signal: "#6FD0B1" },
  { id: "sky-compass", mood: "open", ink: "#172A46", paper: "#EFF9FF", primary: "#65A9E8", accent: "#F07D69", signal: "#F3CB4C" },
  { id: "rust-workshop", mood: "resourceful", ink: "#30241E", paper: "#F8E7C5", primary: "#B96543", accent: "#4E8A79", signal: "#E4B83F" },
  { id: "indigo-proof", mood: "reliable", ink: "#171B3E", paper: "#F1EFFF", primary: "#555BC4", accent: "#42B990", signal: "#F2C04A" },
  { id: "peach-relay", mood: "warm", ink: "#3B2734", paper: "#FFF2DC", primary: "#F09B73", accent: "#6D77C9", signal: "#57C7A6" },
  { id: "teal-vault", mood: "guarded", ink: "#102E35", paper: "#E5FFF3", primary: "#238F8B", accent: "#D16A69", signal: "#F0C84A" },
  { id: "mono-hologram", mood: "rare", ink: "#17212E", paper: "#F4F1E8", primary: "#778899", accent: "#4FC1B6", signal: "#D7B64C" },
];

export const HARMONY_MODES = ["heritage", "inverse", "signal-shift", "moonlit"];

function byte(seed, index) {
  return Number.parseInt(seed.slice((index * 2) % 62, (index * 2) % 62 + 2), 16);
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value.toUpperCase() : null;
}

function applyHarmony(family, harmony, sourceColors) {
  const primary = validColor(sourceColors?.primary);
  const accent = validColor(sourceColors?.accent);
  if (harmony === "inverse") return { ...family, primary: family.accent, accent: family.primary };
  if (harmony === "signal-shift") return { ...family, primary: family.primary, accent: family.signal, signal: family.accent };
  if (harmony === "moonlit") return { ...family, paper: family.ink, ink: family.paper, primary: family.accent, accent: family.primary };
  return { ...family, primary: primary ?? family.primary, accent: accent ?? family.accent };
}

export function resolvePalette(seed, options = {}) {
  const requested = options.paletteId ? PALETTE_FAMILIES.find((item) => item.id === options.paletteId) : null;
  const family = requested ?? PALETTE_FAMILIES[byte(seed, 0) % PALETTE_FAMILIES.length];
  const requestedHarmony = HARMONY_MODES.includes(options.harmony) ? options.harmony : null;
  const harmony = requestedHarmony ?? HARMONY_MODES[byte(seed, 1) % HARMONY_MODES.length];
  const colors = applyHarmony(family, harmony, options.sourceColors);
  return {
    format: PALETTE_FORMAT,
    id: family.id,
    mood: family.mood,
    harmony,
    ink: colors.ink.toUpperCase(),
    paper: colors.paper.toUpperCase(),
    primary: colors.primary.toUpperCase(),
    accent: colors.accent.toUpperCase(),
    signal: colors.signal.toUpperCase(),
  };
}
