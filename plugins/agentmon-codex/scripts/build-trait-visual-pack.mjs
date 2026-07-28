#!/usr/bin/env node
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createPixelSnapperRunner } from "../lib/visual/pixel-snapper-security.mjs";
import { segmentAtlasSubjects } from "../lib/visual/atlas-segmenter.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.AGENTMON_SHARP_MODULE || "sharp");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const assetRoot = resolve(pluginRoot, "assets/visual-v4");
const pixelSnapperSourceRoot = resolve(pluginRoot, "../../spritefusion-pixel-snapper-main");
const pixelSnapperBinary = resolve(pixelSnapperSourceRoot, "target/release/spritefusion-pixel-snapper");
export const DEFAULT_PIXEL_SNAP_STRENGTH = 4;
const PIXEL_SNAP_LEVELS = [
  null,
  { label: "texture-preserving", pixelSize: 1, paletteColors: 256 },
  { label: "very-soft", pixelSize: 1, paletteColors: 224 },
  { label: "soft", pixelSize: 2, paletteColors: 192 },
  { label: "balanced-soft", pixelSize: 2, paletteColors: 160 },
  { label: "balanced", pixelSize: 2, paletteColors: 128 },
  { label: "crisp", pixelSize: 3, paletteColors: 128 },
  { label: "strong", pixelSize: 3, paletteColors: 96 },
  { label: "chunky", pixelSize: 4, paletteColors: 80 },
  { label: "very-chunky", pixelSize: 5, paletteColors: 64 },
  { label: "hard-grid", pixelSize: 6, paletteColors: 48 },
];

export function pixelSnapperProfile(strength = DEFAULT_PIXEL_SNAP_STRENGTH) {
  const level = Number(strength);
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error("Pixel Snap strength must be an integer from 1 to 10.");
  return { engine: "spritefusion-pixel-snapper", version: "1.0.0", license: "MIT", strength: level, ...PIXEL_SNAP_LEVELS[level] };
}

export const TRAIT_AXES = [
  "bodyTopology",
  "eyeSystem",
  "sensorSystem",
  "locomotion",
  "appendageSystem",
  "coreGeometry",
  "material",
  "paletteFamily",
];

const CORE_SPECIES = [
  { id: "archive", name: "Archive Familiar", bodyTopology: "cuboid", eyeSystem: "twin-bars", sensorSystem: "monopole", locomotion: "biped", appendageSystem: "piston-arms", coreGeometry: "screen-rectangle", material: "ceramic-metal", paletteFamily: "cream-teal-gold" },
  { id: "lens", name: "Lens Crawler", bodyTopology: "orb", eyeSystem: "cyclops-lens", sensorSystem: "triple-feelers", locomotion: "quadruped", appendageSystem: "blade-feet", coreGeometry: "round-iris", material: "copper-shell", paletteFamily: "coral-navy-cyan" },
  { id: "prism", name: "Prism Monk", bodyTopology: "triangular-mantle", eyeSystem: "chevron-glyph", sensorSystem: "hooded-prism", locomotion: "hover", appendageSystem: "mantle-fins", coreGeometry: "chevron-stack", material: "woven-alloy", paletteFamily: "indigo-mint-gold" },
  { id: "compass", name: "Compass Drake", bodyTopology: "articulated-long-neck", eyeSystem: "slit-visor", sensorSystem: "branch-antlers", locomotion: "quadruped", appendageSystem: "jointed-tail", coreGeometry: "compass-rings", material: "ivory-plate", paletteFamily: "cream-slate-amber" },
  { id: "core", name: "Core Wisp", bodyTopology: "crystalline-star", eyeSystem: "diamond-core", sensorSystem: "radial-spines", locomotion: "hover", appendageSystem: "pendant-crystal", coreGeometry: "nested-diamond", material: "faceted-crystal", paletteFamily: "jade-cream-black" },
  { id: "relay", name: "Relay Jelly", bodyTopology: "translucent-dome", eyeSystem: "ring-iris", sensorSystem: "dome-receiver", locomotion: "tentacle", appendageSystem: "cable-tentacles", coreGeometry: "concentric-ring", material: "glass-and-cable", paletteFamily: "jade-plum-gold" },
  { id: "beacon", name: "Beacon Beetle", bodyTopology: "segmented-arthropod", eyeSystem: "compound-clusters", sensorSystem: "shell-aerial", locomotion: "hexapod", appendageSystem: "claw-mandibles", coreGeometry: "cell-cluster", material: "laminated-carapace", paletteFamily: "cobalt-copper-jade" },
  { id: "orbit", name: "Orbit Moth", bodyTopology: "winged-orb", eyeSystem: "four-dot", sensorSystem: "twin-antennae", locomotion: "hover", appendageSystem: "broad-moth-wings", coreGeometry: "four-point-array", material: "fabric-alloy", paletteFamily: "plum-cream-amber" },
  { id: "vault", name: "Vault Tortoise", bodyTopology: "armored-dome", eyeSystem: "triple-camera", sensorSystem: "lens-cluster", locomotion: "quadruped", appendageSystem: "column-feet", coreGeometry: "tri-lens", material: "stone-ceramic", paletteFamily: "moss-cream-navy" },
  { id: "signal", name: "Signal Lynx", bodyTopology: "agile-feline", eyeSystem: "panoramic-visor", sensorSystem: "ear-fins", locomotion: "quadruped", appendageSystem: "signal-tail", coreGeometry: "chest-orbit", material: "aero-alloy", paletteFamily: "teal-navy-gold" },
  { id: "rune", name: "Rune Serpent", bodyTopology: "coiled-serpentine", eyeSystem: "spiral-lens", sensorSystem: "orbiting-familiar", locomotion: "serpentine", appendageSystem: "segmented-coil", coreGeometry: "spiral-and-orbit", material: "ivory-segments", paletteFamily: "ivory-slate-cyan" },
  { id: "forge", name: "Forge Crab", bodyTopology: "broad-crustacean", eyeSystem: "multi-eye-row", sensorSystem: "horn-nodes", locomotion: "hexapod", appendageSystem: "crusher-claws", coreGeometry: "visor-array", material: "forged-carapace", paletteFamily: "rust-navy-cyan" },
  { id: "scout", name: "Scout Rabbit", bodyTopology: "upright-lagomorph", eyeSystem: "plus-pair", sensorSystem: "long-ear-radars", locomotion: "biped", appendageSystem: "grip-hands", coreGeometry: "round-heart", material: "porcelain-alloy", paletteFamily: "cream-coral-jade" },
  { id: "oracle", name: "Oracle Owl", bodyTopology: "disk-avian", eyeSystem: "twin-owl-lenses", sensorSystem: "brow-horns", locomotion: "hover", appendageSystem: "short-panel-wings", coreGeometry: "double-orbit", material: "engraved-brass", paletteFamily: "cream-plum-amber" },
  { id: "kernel", name: "Kernel Golem", bodyTopology: "heavy-humanoid", eyeSystem: "brow-visor", sensorSystem: "temple-receivers", locomotion: "knuckle-biped", appendageSystem: "power-arms", coreGeometry: "hex-heart", material: "dense-armor", paletteFamily: "indigo-moss-gold" },
  { id: "echo", name: "Echo Bat", bodyTopology: "radial-chiropteran", eyeSystem: "sonar-rings", sensorSystem: "twin-ear-aerials", locomotion: "hover", appendageSystem: "swept-bat-wings", coreGeometry: "concentric-sonar", material: "acoustic-alloy", paletteFamily: "navy-copper-cyan" },
];

const BIOME_02_SPECIES = [
  { id: "tide", name: "Tide Axolotl", bodyTopology: "gilled-amphibian", eyeSystem: "twin-wave-display", sensorSystem: "six-gill-fins", locomotion: "amphibious-quadruped", appendageSystem: "fin-tail-and-paddles", coreGeometry: "tidal-ripple", material: "pearl-hydroplate", paletteFamily: "salmon-aqua-navy" },
  { id: "scribe", name: "Scribe Spider", bodyTopology: "scroll-abdomen-arachnid", eyeSystem: "six-eye-constellation", sensorSystem: "inkwell-aerial", locomotion: "octopod", appendageSystem: "scribe-claws", coreGeometry: "constellation-wheel", material: "parchment-and-bronze", paletteFamily: "burgundy-parchment-brass" },
  { id: "hammerwake", name: "Hammerwake", bodyTopology: "hammerhead-submersible", eyeSystem: "lateral-tip-lenses", sensorSystem: "dorsal-sonar-fin", locomotion: "tread-fin", appendageSystem: "stabilizer-fins", coreGeometry: "wake-crescent", material: "pressure-steel", paletteFamily: "steel-cobalt-cyan" },
  { id: "peacock", name: "Prism Peacock", bodyTopology: "radial-tail-avian", eyeSystem: "spectral-prism-slit", sensorSystem: "solar-feather-array", locomotion: "proud-quadruped", appendageSystem: "fan-satellite-tail", coreGeometry: "spectrum-spindle", material: "enamel-solarfoil", paletteFamily: "emerald-cobalt-copper" },
  { id: "bore", name: "Bore Rhino", bodyTopology: "wedge-bulldozer", eyeSystem: "hazard-bar-stack", sensorSystem: "drill-horn", locomotion: "heavy-quadruped", appendageSystem: "ram-plow", coreGeometry: "auger-coil", material: "industrial-armor", paletteFamily: "construction-yellow-charcoal-cyan" },
  { id: "spiral", name: "Spiral Archivist", bodyTopology: "archive-snail", eyeSystem: "square-stalk-terminals", sensorSystem: "dual-terminal-stalks", locomotion: "magnetic-glide-foot", appendageSystem: "scroll-shell", coreGeometry: "indexed-spiral", material: "vellum-brass-ceramic", paletteFamily: "lavender-parchment-brass" },
  { id: "pulse", name: "Pulse Hummingbird", bodyTopology: "needle-beak-aerial", eyeSystem: "heartbeat-waveform", sensorSystem: "beak-transmitter", locomotion: "crystal-wing-flight", appendageSystem: "four-crystal-wings", coreGeometry: "pulse-line", material: "ruby-aeroglass", paletteFamily: "ruby-iceblue-navy" },
  { id: "abyss", name: "Abyss Angler", bodyTopology: "deepsea-lantern-fish", eyeSystem: "crescent-mouth-array", sensorSystem: "overhead-lantern", locomotion: "fin-swimmer", appendageSystem: "rudder-fins", coreGeometry: "lunar-mouth", material: "pressure-ceramic", paletteFamily: "abyss-blue-lime-copper" },
  { id: "hex", name: "Hex Pangolin", bodyTopology: "rolling-scaled-rover", eyeSystem: "honeycomb-mask", sensorSystem: "scale-resonators", locomotion: "low-quadruped", appendageSystem: "armored-roll-tail", coreGeometry: "hex-cluster", material: "overlapping-bronze-scales", paletteFamily: "bronze-indigo-yellow" },
  { id: "cinder", name: "Cinder Ram", bodyTopology: "turbine-horn-ram", eyeSystem: "twin-flame-slits", sensorSystem: "curled-turbine-horns", locomotion: "impact-quadruped", appendageSystem: "forge-hooves", coreGeometry: "ember-gates", material: "tempered-iron", paletteFamily: "crimson-iron-amber" },
  { id: "equalizer", name: "Equalizer Frog", bodyTopology: "spring-frog", eyeSystem: "wide-equalizer-face", sensorSystem: "orbital-eye-bulbs", locomotion: "coil-jumper", appendageSystem: "spring-limbs", coreGeometry: "audio-bars", material: "rubberized-alloy", paletteFamily: "lime-navy-cyan" },
  { id: "navigator", name: "Tide Navigator", bodyTopology: "upright-seahorse", eyeSystem: "compass-star-eye", sensorSystem: "snout-probe", locomotion: "curl-tail-hover", appendageSystem: "dorsal-rudder", coreGeometry: "nautical-star", material: "riveted-aquamarine", paletteFamily: "turquoise-coral-gold" },
  { id: "razor", name: "Razor Mantis", bodyTopology: "blade-mantis", eyeSystem: "split-diagonal-pair", sensorSystem: "crown-blades", locomotion: "raptor-hexapod", appendageSystem: "folding-scythes", coreGeometry: "crossed-cuts", material: "white-carbon-ceramic", paletteFamily: "white-red-graphite" },
  { id: "dew", name: "Dew Crane", bodyTopology: "stilt-crane", eyeSystem: "suspended-teardrop", sensorSystem: "lens-beak", locomotion: "stilt-biped", appendageSystem: "folded-panel-wings", coreGeometry: "falling-drop", material: "silver-porcelain", paletteFamily: "silver-cyan-cobalt" },
  { id: "keymimic", name: "Key Mimic", bodyTopology: "chest-terminal", eyeSystem: "keyhole-eye", sensorSystem: "lock-tumbler", locomotion: "stout-quadruped", appendageSystem: "zipper-mouth", coreGeometry: "key-and-teeth", material: "mahogany-and-brass", paletteFamily: "mahogany-gold-cyan" },
  { id: "mycelium", name: "Mycelium Oracle", bodyTopology: "mushroom-network", eyeSystem: "star-constellation-undercap", sensorSystem: "luminous-cap-map", locomotion: "root-cable-crawl", appendageSystem: "mycelial-tendrils", coreGeometry: "connected-stars", material: "bioceramic-mycelium", paletteFamily: "bioluminescent-blue-ochre" },
];

const BIOME_03_SPECIES = [
  { id: "aurorafox", name: "Aurora Fox", bodyTopology: "ribbon-tailed-vulpine", eyeSystem: "aurora-horizon-visor", sensorSystem: "prismatic-ear-fins", locomotion: "phase-quadruped", appendageSystem: "twin-aurora-ribbons", coreGeometry: "polar-light-knot", material: "opal-aero-armor", paletteFamily: "indigo-ice-rainbow" },
  { id: "mosscolossus", name: "Moss Colossus", bodyTopology: "canopy-root-colossus", eyeSystem: "seed-leaf-heart", sensorSystem: "canopy-resonator", locomotion: "rooted-knuckle-walk", appendageSystem: "root-arms-and-vines", coreGeometry: "germination-seed", material: "bark-stone-biocircuit", paletteFamily: "moss-bark-emerald" },
  { id: "glacialwhale", name: "Glacial Whale", bodyTopology: "levitating-cetacean", eyeSystem: "gentle-twin-orbit-mask", sensorSystem: "ice-ridge-sonar", locomotion: "gravity-ring-flight", appendageSystem: "crystal-fins-and-flukes", coreGeometry: "nested-gravity-halo", material: "glacier-plate-alloy", paletteFamily: "cobalt-ice-silver" },
  { id: "lanterngecko", name: "Lantern Gecko", bodyTopology: "splayed-climbing-gecko", eyeSystem: "nocturnal-twin-bar-visor", sensorSystem: "luminous-toe-array", locomotion: "adhesive-wall-crawl", appendageSystem: "bulb-toes-and-cable-tail", coreGeometry: "lantern-cell-grid", material: "jade-flex-ceramic", paletteFamily: "jade-brass-lime" },
  { id: "tempestroc", name: "Tempest Roc", bodyTopology: "turbine-wing-raptor", eyeSystem: "lightning-brow-aperture", sensorSystem: "conductor-beak-crown", locomotion: "storm-wing-flight", appendageSystem: "radial-turbine-feathers", coreGeometry: "forked-bolt-hub", material: "stormsteel-featherfoil", paletteFamily: "slate-cyan-gold" },
  { id: "magnetmole", name: "Magnet Mole", bodyTopology: "wedge-burrow-mammal", eyeSystem: "polar-snouted-lenses", sensorSystem: "flux-whisker-node", locomotion: "tracked-burrow", appendageSystem: "bipolar-clamp-claws", coreGeometry: "horseshoe-flux-loop", material: "industrial-magnetic-steel", paletteFamily: "iron-red-cobalt" },
  { id: "coralnautilus", name: "Coral Nautilus", bodyTopology: "reef-shell-cephalopod", eyeSystem: "pearl-aperture-cluster", sensorSystem: "coral-branch-array", locomotion: "tentacle-glide", appendageSystem: "six-reef-feelers", coreGeometry: "pearl-spiral-gate", material: "coral-pearl-ceramic", paletteFamily: "coral-lilac-aqua" },
  { id: "thunderbison", name: "Thunder Bison", bodyTopology: "generator-humped-bovine", eyeSystem: "storm-wave-brow", sensorSystem: "paired-coil-horns", locomotion: "grounded-charge-quadruped", appendageSystem: "shock-hooves-and-tail", coreGeometry: "thunder-capacitor-bar", material: "midnight-generator-plate", paletteFamily: "navy-bronze-electric-cyan" },
  { id: "mirrorkoi", name: "Mirror Koi", bodyTopology: "floating-reflective-koi", eyeSystem: "ring-mouth-scryer", sensorSystem: "mirror-scale-lateral-line", locomotion: "aerial-current-swim", appendageSystem: "panel-fins-and-fan-tail", coreGeometry: "reflective-orbit-mouth", material: "silver-mirror-enamel", paletteFamily: "pearl-coral-sky" },
  { id: "chronochameleon", name: "Chrono Chameleon", bodyTopology: "arched-clockwork-chameleon", eyeSystem: "independent-clock-iris", sensorSystem: "temporal-crest-dial", locomotion: "precision-grip-crawl", appendageSystem: "curl-tail-and-grip-feet", coreGeometry: "multi-dial-chronometer", material: "verdigris-clockwork", paletteFamily: "olive-brass-magenta" },
  { id: "quakeelephant", name: "Quake Elephant", bodyTopology: "seismic-plate-pachyderm", eyeSystem: "amber-tremor-slits", sensorSystem: "resonator-dish-ears", locomotion: "shockplate-quadruped", appendageSystem: "tuning-fork-trunk", coreGeometry: "seismic-fork-node", material: "granite-steel-armor", paletteFamily: "slate-brass-amber" },
  { id: "nebulasquid", name: "Nebula Squid", bodyTopology: "constellation-arrowhead-squid", eyeSystem: "stellar-network-mask", sensorSystem: "mantle-star-map", locomotion: "void-jet-hover", appendageSystem: "eight-star-cables", coreGeometry: "connected-nebula-nodes", material: "indigo-cosmic-glass", paletteFamily: "midnight-violet-starlight" },
  { id: "solarjackal", name: "Solar Jackal", bodyTopology: "upright-solar-jackal", eyeSystem: "sun-slit-pair", sensorSystem: "long-radar-ears", locomotion: "digitigrade-scout", appendageSystem: "solar-collar-and-beacon-tail", coreGeometry: "radiant-disc-gate", material: "obsidian-solarfoil", paletteFamily: "black-gold-orange" },
  { id: "hollowwyrm", name: "Hollow Wyrm", bodyTopology: "many-legged-tunnel-wyrm", eyeSystem: "hollow-ring-maw", sensorSystem: "ribbed-ground-feelers", locomotion: "centipede-bore", appendageSystem: "reinforced-segment-legs", coreGeometry: "recursive-tunnel-ring", material: "purple-bore-armor", paletteFamily: "plum-bronze-cyan" },
  { id: "crystalbee", name: "Crystal Bee", bodyTopology: "faceted-pollinator", eyeSystem: "honeycomb-lens-cluster", sensorSystem: "crystal-antenna-pair", locomotion: "glass-wing-flight", appendageSystem: "four-facet-wings-and-needle-legs", coreGeometry: "radiant-honeycomb-core", material: "amber-crystal-alloy", paletteFamily: "amber-navy-prism" },
  { id: "datacapybara", name: "Data Capybara", bodyTopology: "amphibious-server-capybara", eyeSystem: "blunt-muzzle-data-screen", sensorSystem: "rack-antenna-stack", locomotion: "webbed-rover-quadruped", appendageSystem: "server-saddle-and-paddle-feet", coreGeometry: "stacked-data-bars", material: "copper-river-ceramic", paletteFamily: "copper-teal-charcoal" },
];

const BIOME_04_SPECIES = [
  { id: "veylune", name: "Veylune", bodyTopology: "levitating-trisail-familiar", eyeSystem: "twin-orbit-plus-star", sensorSystem: "three-sail-ear-array", locomotion: "comet-hover", appendageSystem: "split-lumen-tail", coreGeometry: "nested-star-diamond", material: "astral-velvet", paletteFamily: "midnight-violet-cyan" },
  { id: "bramblethrum", name: "Bramblethrum", bodyTopology: "six-leg-halo-grazer", eyeSystem: "seed-diamond-pair", sensorSystem: "living-branch-crown", locomotion: "moss-sixstep", appendageSystem: "root-hooves-and-halo", coreGeometry: "sprout-diamond", material: "bark-wool-biolume", paletteFamily: "ivory-bark-moss" },
  { id: "orivex", name: "Orivex", bodyTopology: "asymmetric-ribbon-upright", eyeSystem: "mismatched-gem-pair", sensorSystem: "quad-ear-spectrum", locomotion: "ribbon-biped", appendageSystem: "ribbon-arms-orbit-tail", coreGeometry: "orbit-bead-kite", material: "silkfur-opal", paletteFamily: "cream-orange-teal" },
  { id: "cindervane", name: "Cindervane", bodyTopology: "forepaw-fur-serpent", eyeSystem: "ember-ring-eye", sensorSystem: "plume-crest-sensor", locomotion: "serpentine-sprint", appendageSystem: "front-paws-fork-lantern-tail", coreGeometry: "forked-ember-lantern", material: "cinder-plume-fur", paletteFamily: "cream-navy-ember" },
  { id: "nimbuskelp", name: "Nimbuskelp", bodyTopology: "cloud-root-leviathan", eyeSystem: "crescent-window-eye", sensorSystem: "cloud-horn-pair", locomotion: "root-tendril-hover", appendageSystem: "dangling-root-tentacles", coreGeometry: "lunar-cloud-window", material: "vapor-wool-root", paletteFamily: "cloud-ivory-indigo" },
  { id: "glyphora", name: "Glyphora", bodyTopology: "masked-hexapod-pouncer", eyeSystem: "lower-mask-slit-pair", sensorSystem: "fan-whisker-array", locomotion: "six-paw-prowl", appendageSystem: "mask-claws-glyph-tail", coreGeometry: "rotating-target-glyph", material: "rune-fur-ceramic", paletteFamily: "cream-indigo-chartreuse" },
  { id: "mothram", name: "Mothram", bodyTopology: "four-mantle-plush-glider", eyeSystem: "twin-star-pupils", sensorSystem: "braided-antenna-crown", locomotion: "mantle-wing-hover", appendageSystem: "quad-moth-mantles", coreGeometry: "star-braid-heart", material: "stardust-fleece", paletteFamily: "ivory-plum-gold" },
  { id: "quillora", name: "Quillora", bodyTopology: "quill-bloom-spiral-hopper", eyeSystem: "single-horizontal-iris", sensorSystem: "luminous-petal-crown", locomotion: "triple-spiral-roll", appendageSystem: "radiant-quill-petals", coreGeometry: "iris-spiral-node", material: "opal-quill-down", paletteFamily: "cream-prism-aqua" },
  { id: "sunskein", name: "Sunskein", bodyTopology: "halo-tail-digitigrade", eyeSystem: "sunline-tear-eye", sensorSystem: "solar-crest-fans", locomotion: "petal-hoof-stride", appendageSystem: "triple-braided-sun-tail", coreGeometry: "hollow-sun-ring", material: "solar-skein-fur", paletteFamily: "ivory-amber-burgundy" },
  { id: "echomere", name: "Echomere", bodyTopology: "shell-ear-low-runner", eyeSystem: "teal-drop-pair", sensorSystem: "twin-conch-receivers", locomotion: "tuning-fork-crawl", appendageSystem: "fork-paws-throat-orbs", coreGeometry: "double-echo-drop", material: "acoustic-velvet", paletteFamily: "cream-slate-teal" },
  { id: "runeburrow", name: "Runeburrow", bodyTopology: "shovel-crown-tunneler", eyeSystem: "five-eye-arc", sensorSystem: "dorsal-spade-sensor", locomotion: "bore-quadruped", appendageSystem: "dig-claws-corkscrew-tail", coreGeometry: "five-node-spiral", material: "deep-velvet-scale", paletteFamily: "plum-silver-turquoise" },
  { id: "tidemantle", name: "Tidemantle", bodyTopology: "furred-ray-walker", eyeSystem: "pearl-mask-twin-dots", sensorSystem: "lateral-tide-fins", locomotion: "four-fin-glide", appendageSystem: "fin-paws-ribbon-tail", coreGeometry: "pearl-tide-drop", material: "hydrofur-mantle", paletteFamily: "navy-pearl-aqua" },
  { id: "thornhalo", name: "Thornhalo", bodyTopology: "four-arm-orbit-familiar", eyeSystem: "seed-amber-pair", sensorSystem: "leaf-ear-branch-crown", locomotion: "root-foot-biped", appendageSystem: "quad-vine-arms-thorn-ring", coreGeometry: "orbit-seed-ring", material: "canopy-fleece", paletteFamily: "moss-ivory-amber" },
  { id: "dreamgraze", name: "Dreamgraze", bodyTopology: "hoofless-dream-levitator", eyeSystem: "closed-crescent-pair", sensorSystem: "veil-crest-sensor", locomotion: "stone-step-hover", appendageSystem: "floating-paw-stones", coreGeometry: "sleeping-moon-knot", material: "oneiric-velvet", paletteFamily: "cream-lilac-starlight" },
  { id: "prismurk", name: "Prismurk", bodyTopology: "inverted-antler-shadow-hunch", eyeSystem: "ear-spot-quartet", sensorSystem: "downward-crystal-antlers", locomotion: "shadow-hop", appendageSystem: "belly-lantern-maw", coreGeometry: "inverted-lantern-gate", material: "nightfur-crystal", paletteFamily: "midnight-amber-prism" },
  { id: "astraloom", name: "Astraloom", bodyTopology: "dual-face-portal-regal", eyeSystem: "sun-moon-face-pair", sensorSystem: "mane-portal-crown", locomotion: "constellation-paw-walk", appendageSystem: "lattice-star-tail", coreGeometry: "twin-orbit-portal", material: "cosmic-fleece", paletteFamily: "ivory-cosmos-pastel" },
];

const BIOME_05_SPECIES = [
  { id: "pyraven", name: "Pyraven", affinity: "fire", bodyTopology: "four-arm-ringtail-levitator", eyeSystem: "triple-ember-mask", sensorSystem: "backward-flame-vane-crown", locomotion: "thermal-ring-hover", appendageSystem: "quad-graspers-captive-flame-tail", coreGeometry: "hollow-sun-coil", material: "charcoal-fleece-magma", paletteFamily: "coal-scarlet-solar" },
  { id: "calderaum", name: "Calderaum", affinity: "fire", bodyTopology: "six-leg-volcanic-grazer", eyeSystem: "twin-furnace-portals", sensorSystem: "obsidian-petal-horns", locomotion: "magma-sixstep", appendageSystem: "lava-bowl-back-and-stone-hooves", coreGeometry: "open-caldera-heart", material: "basalt-fur-lava", paletteFamily: "basalt-ember-copper" },
  { id: "cindersyl", name: "Cindersyl", affinity: "fire", bodyTopology: "forepaw-soot-plume-runner", eyeSystem: "single-cinder-slit", sensorSystem: "orbiting-ember-mask-triad", locomotion: "smoke-tail-sprint", appendageSystem: "two-front-paws-forked-smoke-tail", coreGeometry: "three-mask-ember-orbit", material: "soot-fur-copper-quill", paletteFamily: "obsidian-orange-smoke" },
  { id: "heliovex", name: "Heliovex", affinity: "fire", bodyTopology: "solar-ribbon-upright", eyeSystem: "faceless-radiant-visor", sensorSystem: "split-crown-ears", locomotion: "sun-orbit-flight", appendageSystem: "twin-ribbon-arms-twin-ember-wings", coreGeometry: "triple-solar-waist", material: "solarfoil-flame-silk", paletteFamily: "gold-white-crimson" },
  { id: "nacrell", name: "Nacrell", affinity: "water", bodyTopology: "round-tide-finwalker", eyeSystem: "crescent-water-aperture", sensorSystem: "waterfall-mane-crest", locomotion: "four-fin-paddle", appendageSystem: "translucent-fin-paws-pearl-tail", coreGeometry: "lunar-tide-basin", material: "nacre-hydrofur", paletteFamily: "pearl-aqua-lilac" },
  { id: "rillora", name: "Rillora", affinity: "water", bodyTopology: "loop-stream-quadruped", eyeSystem: "dual-koi-face-windows", sensorSystem: "reed-antenna-pair", locomotion: "dissolving-droplet-step", appendageSystem: "fluid-paws-stream-ribbons", coreGeometry: "infinite-river-loop", material: "liquid-silk-scale", paletteFamily: "river-blue-ivory-coral" },
  { id: "abyssalune", name: "Abyssalune", affinity: "water", bodyTopology: "shell-hood-tendril-drifter", eyeSystem: "single-starry-abyss-eye", sensorSystem: "bioluminescent-tide-crown", locomotion: "six-lantern-tendril-drift", appendageSystem: "hand-fins-lantern-tentacles", coreGeometry: "deepwater-star-well", material: "abyss-velvet-shell", paletteFamily: "midnight-cobalt-biolume" },
  { id: "glacivane", name: "Glacivane", affinity: "water", bodyTopology: "three-limb-ice-rib-beast", eyeSystem: "frosted-twin-spear-eyes", sensorSystem: "wave-antler-array", locomotion: "tri-skate-glide", appendageSystem: "ice-limbs-frozen-spray-tail", coreGeometry: "suspended-liquid-rib-core", material: "crystal-ice-flow", paletteFamily: "glacier-blue-silver-violet" },
  { id: "geodrum", name: "Geodrum", affinity: "earth", bodyTopology: "eight-foot-geode-pouncer", eyeSystem: "four-gem-crack-eyes", sensorSystem: "quartz-crown-cluster", locomotion: "octo-dig-prowl", appendageSystem: "quartz-claws-orbiting-stone-rings", coreGeometry: "rotating-geode-orbits", material: "stone-moss-crystal", paletteFamily: "granite-amethyst-moss" },
  { id: "rootthrone", name: "Rootthrone", affinity: "earth", bodyTopology: "four-branch-canopy-guardian", eyeSystem: "hollow-seed-mask", sensorSystem: "miniature-canopy-halo", locomotion: "boulder-root-stride", appendageSystem: "quad-branch-arms-fungal-spine", coreGeometry: "seed-gate-tree-ring", material: "root-fleece-bark-fungi", paletteFamily: "bark-canopy-turquoise" },
  { id: "dunemaw", name: "Dunemaw", affinity: "earth", bodyTopology: "floating-spiral-sandstone", eyeSystem: "vertical-mouth-eye", sensorSystem: "twin-dune-sail-ears", locomotion: "pebble-orbit-hover", appendageSystem: "four-sand-ribbon-limbs", coreGeometry: "spiral-desert-aperture", material: "sandstone-dust-silk", paletteFamily: "ochre-rose-amber" },
  { id: "ironbloom", name: "Ironbloom", affinity: "earth", bodyTopology: "six-leg-magnetic-flower-beast", eyeSystem: "horseshoe-face-aperture", sensorSystem: "crystal-bloom-back", locomotion: "compass-hexapod", appendageSystem: "articulated-metal-petals", coreGeometry: "magnetic-flower-gate", material: "mineral-fur-ferrous-petal", paletteFamily: "iron-amethyst-brass" },
  { id: "zephyloop", name: "Zephyloop", affinity: "air", bodyTopology: "hollow-cloud-ring", eyeSystem: "opposed-ring-eyes", sensorSystem: "pennant-ear-pair", locomotion: "detached-breeze-paw-hover", appendageSystem: "four-floating-paws-comet-ribbon-tail", coreGeometry: "open-wind-circle", material: "cloud-fleece-aeroglass", paletteFamily: "white-sky-cyan" },
  { id: "cirravox", name: "Cirravox", affinity: "air", bodyTopology: "long-neck-windchime-familiar", eyeSystem: "small-beaked-mask-slit", sensorSystem: "asymmetric-trisail-wings", locomotion: "bell-foot-levitation", appendageSystem: "three-sail-wings-dangling-bells", coreGeometry: "transparent-chime-cage", material: "cirrus-silk-brass-glass", paletteFamily: "silver-blue-brass" },
  { id: "stormwisp", name: "Stormwisp", affinity: "air", bodyTopology: "radial-thunder-fleece", eyeSystem: "central-calm-storm-eye", sensorSystem: "lightning-whisker-array", locomotion: "cyclone-tail-hover", appendageSystem: "five-radial-wing-fins", coreGeometry: "storm-eye-vortex", material: "thundercloud-fur-lightning", paletteFamily: "storm-navy-violet-gold" },
  { id: "aetherloom", name: "Aetherloom", affinity: "air", bodyTopology: "dual-face-portal-cloud-regal", eyeSystem: "paired-serene-sky-faces", sensorSystem: "constellation-feather-shards", locomotion: "braided-current-flight", appendageSystem: "floating-star-wings-sky-tail", coreGeometry: "aether-portal-mane", material: "cosmic-cloud-fleece", paletteFamily: "cloud-white-cosmos-blue" },
];

const BIOME_06_SPECIES = [
  { id: "cachecoon", name: "Cachecoon", role: "archive", bodyTopology: "ring-cache-raccoon", eyeSystem: "mint-mask-binocular", sensorSystem: "hand-scanner-array", locomotion: "magnetic-paw-scuttle", appendageSystem: "rotating-storage-band-tail", coreGeometry: "stacked-cache-ports", material: "slate-ceramic-memory-bands", paletteFamily: "gray-ivory-mint" },
  { id: "dockotter", name: "Dockotter", role: "collaboration", bodyTopology: "pressure-hull-otter", eyeSystem: "friendly-side-camera-pair", sensorSystem: "receiver-whisker-grid", locomotion: "amphibious-gripper-slide", appendageSystem: "handshake-paws-rudder-tail", coreGeometry: "transfer-belly-dock", material: "teal-pressure-ceramic", paletteFamily: "aqua-cream-slate" },
  { id: "patchpanda", name: "Patchpanda", role: "maintenance", bodyTopology: "repair-frame-red-panda", eyeSystem: "round-diagnostic-pair", sensorSystem: "directional-patch-ears", locomotion: "nimble-service-quadruped", appendageSystem: "cable-bundle-patch-tail", coreGeometry: "circular-maintenance-hub", material: "copper-cream-service-alloy", paletteFamily: "copper-ivory-charcoal" },
  { id: "threadferret", name: "Threadferret", role: "routing", bodyTopology: "long-segment-context-bus", eyeSystem: "scrolling-horizontal-visor", sensorSystem: "distributed-side-port-line", locomotion: "multi-foot-magnetic-crawl", appendageSystem: "fiber-loop-route-tail", coreGeometry: "serial-context-nodes", material: "ivory-plum-flex-segments", paletteFamily: "cream-slate-magenta-cyan" },
  { id: "quillguard", name: "Quillguard", role: "security", bodyTopology: "firewall-quill-hedgehog", eyeSystem: "amber-threat-slit", sensorSystem: "folding-ceramic-quill-array", locomotion: "low-stability-quadruped", appendageSystem: "radial-defense-blades", coreGeometry: "threat-status-orbit", material: "navy-ceramic-firewall", paletteFamily: "navy-ivory-amber" },
  { id: "cacheglide", name: "Cacheglide", role: "caching", bodyTopology: "upright-cartridge-squirrel", eyeSystem: "twin-green-cache-lenses", sensorSystem: "processor-ear-pair", locomotion: "spring-foot-courier", appendageSystem: "crescent-cartridge-stack-tail", coreGeometry: "cheek-cache-gates", material: "copper-memory-ceramic", paletteFamily: "bronze-cream-mint" },
  { id: "veilskunk", name: "Veilskunk", role: "privacy", bodyTopology: "filter-plume-skunk", eyeSystem: "censor-bar-visor", sensorSystem: "redaction-sniffer-node", locomotion: "silent-low-prowl", appendageSystem: "overlapping-filter-panel-tail", coreGeometry: "privacy-shield-disc", material: "black-ivory-filter-alloy", paletteFamily: "charcoal-ivory-teal" },
  { id: "napnode", name: "Napnode", role: "scheduling", bodyTopology: "round-lowpower-koala", eyeSystem: "sleep-line-display", sensorSystem: "dual-heatsink-ears", locomotion: "four-clamp-branch-grip", appendageSystem: "charging-clamp-paws", coreGeometry: "power-status-belly-ring", material: "cream-thermal-ceramic", paletteFamily: "ivory-slate-jade" },
  { id: "longhold", name: "Longhold", role: "persistence", bodyTopology: "anchor-arm-sloth", eyeSystem: "calm-timer-orbits", sensorSystem: "back-clock-resonator", locomotion: "longreach-anchor-crawl", appendageSystem: "dual-cable-arms-anchor-claws", coreGeometry: "slow-rotating-clock", material: "moss-brass-persistence-shell", paletteFamily: "moss-cream-brass" },
  { id: "scoutpost", name: "Scoutpost", role: "research", bodyTopology: "telescoping-meerkat-watchtower", eyeSystem: "panoramic-periscope-bar", sensorSystem: "triple-lens-observation-head", locomotion: "upright-tripod-balance", appendageSystem: "folding-research-arms-antenna-tail", coreGeometry: "vertical-scout-stack", material: "sandstone-ceramic-optics", paletteFamily: "tan-cream-teal" },
  { id: "breakbadger", name: "Breakbadger", role: "debugging", bodyTopology: "wedge-breaker-badger", eyeSystem: "red-error-code-pair", sensorSystem: "fault-light-shoulder-bank", locomotion: "reinforced-low-tread", appendageSystem: "massive-diagnostic-breaker-claws", coreGeometry: "error-reset-drum", material: "black-ivory-impact-alloy", paletteFamily: "black-white-red" },
  { id: "loomllama", name: "Loomllama", role: "compression", bodyTopology: "spool-fleece-alpaca", eyeSystem: "gentle-green-slit-visor", sensorSystem: "upright-token-ear-pair", locomotion: "fine-servo-quadruped", appendageSystem: "braided-output-tail", coreGeometry: "parallel-data-spool-rack", material: "cream-lavender-spool-fleece", paletteFamily: "ivory-lilac-mint" },
  { id: "polarping", name: "Polarping", role: "cold-compute", bodyTopology: "thermal-tank-penguin", eyeSystem: "cyan-dual-dot-face", sensorSystem: "rear-temperature-antenna", locomotion: "stable-waddle-slide", appendageSystem: "heat-exchange-panel-flippers", coreGeometry: "coolant-belly-window", material: "black-white-thermal-shell", paletteFamily: "charcoal-cream-iceblue" },
  { id: "parcelican", name: "Parcelican", role: "artifact-delivery", bodyTopology: "cargo-bay-pelican", eyeSystem: "lateral-courier-camera", sensorSystem: "manifest-light-throat-row", locomotion: "panel-wing-flight-and-landing", appendageSystem: "sealed-beak-cargo-compartment", coreGeometry: "rectangular-artifact-vault", material: "cream-coral-cargo-alloy", paletteFamily: "ivory-coral-slate" },
  { id: "sonarseal", name: "Sonarseal", role: "audio", bodyTopology: "sonar-hull-seal", eyeSystem: "concentric-acoustic-face", sensorSystem: "microphone-whisker-fan", locomotion: "broad-fin-controller-glide", appendageSystem: "tapered-swim-body-speaker-rings", coreGeometry: "multi-ring-sonar-array", material: "silver-blue-acoustic-ceramic", paletteFamily: "silver-cobalt-teal" },
  { id: "tooltopus", name: "Tooltopus", role: "orchestration", bodyTopology: "eight-tool-octopus", eyeSystem: "twin-mint-round-displays", sensorSystem: "distributed-tooltip-cameras", locomotion: "octo-articulated-crawl", appendageSystem: "eight-distinct-safe-gripper-tools", coreGeometry: "central-diamond-orchestrator", material: "plum-flex-alloy-brass", paletteFamily: "plum-slate-mint-gold" },
];

export const FOUNDING_SPECIES = [...CORE_SPECIES, ...BIOME_02_SPECIES, ...BIOME_03_SPECIES, ...BIOME_04_SPECIES, ...BIOME_05_SPECIES, ...BIOME_06_SPECIES];

const ATLAS_BATCHES = [
  { species: CORE_SPECIES, form01: "core-form-01-atlas.png", creature: "founding-species-atlas-v4.png", form03: "core-form-03-atlas.png", egg: "founding-eggs-atlas-v4.png" },
  { species: BIOME_02_SPECIES, form01: "biome-02-form-01-atlas.png", creature: "biome-02-species-atlas.png", form03: "biome-02-form-03-atlas.png", egg: "biome-02-eggs-atlas.png" },
  { species: BIOME_03_SPECIES, form01: "biome-03-form-01-atlas.png", creature: "biome-03-species-atlas.png", form03: "biome-03-form-03-atlas.png", egg: "biome-03-eggs-atlas.png" },
  { species: BIOME_04_SPECIES, form01: "biome-04-form-01-atlas.png", creature: "biome-04-species-atlas.png", form03: "biome-04-form-03-atlas.png", egg: "biome-04-eggs-atlas.png" },
  { species: BIOME_05_SPECIES, form01: "biome-05-form-01-atlas.png", creature: "biome-05-species-atlas.png", form03: "biome-05-form-03-atlas.png", egg: "biome-05-eggs-atlas.png" },
  { species: BIOME_06_SPECIES, form01: "biome-06-form-01-atlas.png", creature: "biome-06-species-atlas.png", form03: "biome-06-form-03-atlas.png", egg: "biome-06-eggs-atlas.png" },
];

export const EVOLUTION_STAGES = [
  { id: "form-01", order: 1, label: "Form I", assetRoot: "species/form-01/forms" },
  { id: "form-02", order: 2, label: "Form II", assetRoot: "species/forms" },
  { id: "form-03", order: 3, label: "Form III", assetRoot: "species/form-03/forms" },
];

export const SPECIES_MORPHS = [
  { id: "standard", rarity: "common", weight: 8500, transform: null },
  { id: "regional", rarity: "uncommon", weight: 1000, transform: { hue: 35, saturation: 1.06, brightness: 1 } },
  { id: "rare", rarity: "rare", weight: 400, transform: { hue: 195, saturation: 0.82, brightness: 0.88 } },
  { id: "mythic", rarity: "mythic", weight: 100, transform: { hue: 315, saturation: 0.7, brightness: 1.12 } },
];

function traitDistance(left, right) {
  return TRAIT_AXES.filter((axis) => left[axis] !== right[axis]).length;
}

function validateTraitCatalog() {
  for (const species of FOUNDING_SPECIES) {
    for (const axis of TRAIT_AXES) if (!species[axis]) throw new Error(`${species.id} is missing ${axis}.`);
  }
  for (let left = 0; left < FOUNDING_SPECIES.length; left += 1) {
    for (let right = left + 1; right < FOUNDING_SPECIES.length; right += 1) {
      const distance = traitDistance(FOUNDING_SPECIES[left], FOUNDING_SPECIES[right]);
      if (distance < 5) throw new Error(`${FOUNDING_SPECIES[left].id} and ${FOUNDING_SPECIES[right].id} differ on only ${distance} trait axes.`);
    }
  }
}

async function validateSprite(sprite, label) {
  const { data, info } = await sharp(sprite).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  const colors = new Set();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const alpha = data[offset + 3];
      if ((x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) && alpha !== 0) throw new Error(`${label} touches its border.`);
      if (alpha > 16) visible += 1;
      if (alpha > 220) colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
  }
  const coverage = visible / (info.width * info.height);
  if (coverage < 0.04 || coverage > 0.78) throw new Error(`${label} has invalid coverage ${coverage.toFixed(3)}.`);
  if (colors.size < 32) throw new Error(`${label} lacks material depth (${colors.size} colors).`);
}

async function normalizeSnappedSprite(snapped) {
  return sharp(snapped)
    .resize(236, 236, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function sliceAtlas(source, destination, speciesBatch, profile, runner, onProgress = () => {}) {
  const atlas = await segmentAtlasSubjects(source, speciesBatch.length);
  await mkdir(destination, { recursive: true });
  const prepared = [];
  for (const [index, species] of speciesBatch.entries()) {
    const subject = atlas.subjects[index];
    const cell = await atlas.extract(subject, 8);
    const normalized = await sharp(cell)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(236, 236, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    prepared.push({ id: species.id, buffer: normalized });
  }
  const snapped = await runner.processBatch(prepared, profile);
  for (const species of speciesBatch) {
    const sprite = await normalizeSnappedSprite(snapped.get(species.id));
    await validateSprite(sprite, `${destination}/${species.id}`);
    await writeFile(resolve(destination, `${species.id}.png`), sprite);
    onProgress(1, `Snapped ${species.name}`);
  }
}

async function buildMorphs(sourceRoot, forms, onProgress = () => {}) {
  await mkdir(forms, { recursive: true });
  for (const species of FOUNDING_SPECIES) {
    const base = resolve(sourceRoot, `${species.id}.png`);
    for (const morph of SPECIES_MORPHS) {
      const pipeline = sharp(base);
      if (morph.transform) pipeline.modulate(morph.transform);
      const sprite = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
      await validateSprite(sprite, `${forms}/${species.id}-${morph.id}`);
      await writeFile(resolve(forms, `${species.id}-${morph.id}.png`), sprite);
      onProgress(1, `Built ${species.name} · ${morph.id}`);
    }
  }
}

async function commitGeneratedPack(stagingRoot) {
  const generatedPaths = ["species", "eggs", "manifest.json"];
  const replaced = [];
  try {
    for (const name of generatedPaths) {
      const target = resolve(assetRoot, name);
      const incoming = resolve(stagingRoot, name);
      const backup = resolve(stagingRoot, `.previous-${name.replaceAll("/", "-")}`);
      await rename(target, backup);
      try {
        await rename(incoming, target);
      } catch (error) {
        await rename(backup, target).catch(() => {});
        throw error;
      }
      replaced.push({ target, backup });
    }
  } catch (error) {
    for (const { target, backup } of replaced.reverse()) {
      await rm(target, { recursive: true, force: true }).catch(() => {});
      await rename(backup, target).catch(() => {});
    }
    throw error;
  }
}

export async function buildTraitVisualPack(options = {}) {
  const profile = pixelSnapperProfile(options.snapStrength);
  const runner = await createPixelSnapperRunner({ binaryPath: pixelSnapperBinary, sourceRoot: pixelSnapperSourceRoot });
  const pixelSnapper = { ...profile, security: runner.integrity };
  const totalWork = (ATLAS_BATCHES.length * 4 * 16) + (FOUNDING_SPECIES.length * SPECIES_MORPHS.length * 4) + 1;
  let completedWork = 0;
  const reportProgress = (increment, label) => {
    completedWork += increment;
    options.onProgress?.({ completed: completedWork, total: totalWork, label });
  };
  validateTraitCatalog();
  const stagingRoot = await mkdtemp(resolve(dirname(assetRoot), ".visual-v4-rebuild-"));
  options.onStaging?.(stagingRoot);
  const manifest = {
    format: "agentmon.trait-visual-pack/v1",
    id: "trait-founders-v4",
    renderer: "agentmon-trait-atlas/v4",
    artDirection: "premium-pixel-species-with-visible-trait-grammar",
    grid: { spriteWidth: 256, spriteHeight: 256 },
    traitSystem: { axes: TRAIT_AXES, minimumPairwiseDistance: 5, eyeSystemsMustBeSpeciesDistinct: true },
    species: FOUNDING_SPECIES,
    speciesCount: FOUNDING_SPECIES.length,
    catalogTargetSpecies: 256,
    morphs: SPECIES_MORPHS,
    pixelSnapper,
    biomes: [
      { id: "founders-core", name: "Founders Core", species: CORE_SPECIES.map((species) => species.id) },
      { id: "tidal-forge", name: "Tidal Forge", species: BIOME_02_SPECIES.map((species) => species.id) },
      { id: "riftwild", name: "Riftwild", species: BIOME_03_SPECIES.map((species) => species.id) },
      { id: "mythweave-wilds", name: "Mythweave Wilds", species: BIOME_04_SPECIES.map((species) => species.id) },
      { id: "elemental-conflux", name: "Elemental Conflux", species: BIOME_05_SPECIES.map((species) => species.id), affinities: ["fire", "water", "earth", "air"] },
      { id: "circuitwild-commons", name: "Circuitwild Commons", species: BIOME_06_SPECIES.map((species) => species.id), roles: BIOME_06_SPECIES.map((species) => species.role) },
    ],
    evolutionStages: EVOLUTION_STAGES,
    formCount: EVOLUTION_STAGES.length,
    selectableAppearances: FOUNDING_SPECIES.length * SPECIES_MORPHS.length * EVOLUTION_STAGES.length,
    qualityPolicy: { rawCartesianAssemblyAllowed: false, authoredSilhouettesRequired: true, authoredEvolutionFormsRequired: true, pixelGridSnappingRequired: true, minimumTraitDistance: 5, runtimeGenerativeImageCalls: false, transparentBorderRequired: true, minimumOpaqueColors: 32 },
    privacy: { rawPromptsIncluded: false, localAssetsOnly: true },
  };
  try {
    for (const batch of ATLAS_BATCHES) {
      await sliceAtlas(resolve(assetRoot, batch.form01), resolve(stagingRoot, "species/form-01"), batch.species, profile, runner, reportProgress);
      await sliceAtlas(resolve(assetRoot, batch.creature), resolve(stagingRoot, "species"), batch.species, profile, runner, reportProgress);
      await sliceAtlas(resolve(assetRoot, batch.form03), resolve(stagingRoot, "species/form-03"), batch.species, profile, runner, reportProgress);
      await sliceAtlas(resolve(assetRoot, batch.egg), resolve(stagingRoot, "eggs"), batch.species, profile, runner, reportProgress);
    }
    await Promise.all([
      buildMorphs(resolve(stagingRoot, "species/form-01"), resolve(stagingRoot, "species/form-01/forms"), reportProgress),
      buildMorphs(resolve(stagingRoot, "species"), resolve(stagingRoot, "species/forms"), reportProgress),
      buildMorphs(resolve(stagingRoot, "species/form-03"), resolve(stagingRoot, "species/form-03/forms"), reportProgress),
      buildMorphs(resolve(stagingRoot, "eggs"), resolve(stagingRoot, "eggs/forms"), reportProgress),
    ]);
    await writeFile(resolve(stagingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    options.onCommit?.(true);
    try {
      await commitGeneratedPack(stagingRoot);
    } finally {
      options.onCommit?.(false);
    }
    reportProgress(1, "Catalog committed safely");
    return { assetRoot, manifest };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    options.onStaging?.(null);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const strengthIndex = process.argv.indexOf("--snap-strength");
  const snapStrength = strengthIndex === -1 ? DEFAULT_PIXEL_SNAP_STRENGTH : Number(process.argv[strengthIndex + 1]);
  const onProgress = ({ completed, total, label }) => process.stdout.write(`AGENTMON_PROGRESS ${completed} ${total} ${label}\n`);
  let activeStagingRoot = null;
  let commitInProgress = false;
  const onStaging = (path) => { activeStagingRoot = path; };
  const onCommit = (active) => { commitInProgress = active; };
  process.once("SIGTERM", async () => {
    if (commitInProgress) return;
    if (activeStagingRoot) await rm(activeStagingRoot, { recursive: true, force: true }).catch(() => {});
    process.exit(143);
  });
  buildTraitVisualPack({ snapStrength, onProgress, onStaging, onCommit }).then(({ assetRoot, manifest }) => process.stdout.write(`${JSON.stringify({ assetRoot, pack: manifest.id, species: manifest.speciesCount, forms: manifest.formCount, appearances: manifest.selectableAppearances, visibleTraitAxes: manifest.traitSystem.axes.length, morphs: manifest.morphs.length, pixelSnapper: manifest.pixelSnapper }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
