const BIOME_PROFILES = {
  "founders-core": {
    habitats: ["the first relay vaults", "quiet compiler ruins", "abandoned signal gardens", "the warm vents beneath old terminals"],
    classes: ["Archive Keeper", "Signal Scout", "Core Warden", "Pattern Cartographer"],
    duties: ["keeps damaged memories in the correct order", "maps safe paths through forgotten networks", "protects small signals until they become strong", "translates old machine rhythms into new routes"],
    legends: ["Old builders leave one status light burning so it can find the way home.", "Its arrival is said to mark the beginning of a useful idea.", "No two trainers agree on its oldest remembered route.", "It prefers careful work to loud machinery."],
    moves: ["Memory Lantern", "Relay Step", "Core Ward", "Pattern Wake"],
  },
  "tidal-forge": {
    habitats: ["pressure-lit reef foundries", "the copper shallows", "submerged assembly caverns", "tide-powered workshops"],
    classes: ["Current Smith", "Reef Surveyor", "Pressure Runner", "Tide Mechanic"],
    duties: ["repairs tools between the turning tides", "reads changes in current before a storm arrives", "carries fragile mechanisms through deep water", "keeps the reef foundries from falling silent"],
    legends: ["Divers follow the glow of its joints when the water turns black.", "It trades polished sea-glass for broken machine parts.", "Its route is visible only at the lowest tide.", "A calm one will wait beside a stalled vessel until morning."],
    moves: ["Current Forge", "Pressure Ping", "Tidal Relay", "Reef Mend"],
  },
  riftwild: {
    habitats: ["the aurora faultlands", "glacier-carved data canyons", "stormglass plateaus", "the magnetic rift edge"],
    classes: ["Rift Pathfinder", "Storm Listener", "Fault Sentinel", "Aurora Forager"],
    duties: ["finds stable ground where maps stop working", "listens for distant movement through the ice", "marks dangerous fractures with a steady pulse", "collects charge from passing auroras"],
    legends: ["Travelers say its footprints point home even after the snow covers them.", "It becomes completely still when the rift is about to shift.", "Its oldest trails cross places that no longer exist.", "It shares warmth with smaller machines during whiteout nights."],
    moves: ["Rift Compass", "Aurora Call", "Fault Lock", "Storm Trace"],
  },
  "mythweave-wilds": {
    habitats: ["woven-light forests", "the dusk-thread marsh", "loomroot clearings", "the mirrored canopy"],
    classes: ["Thread Forager", "Canopy Guide", "Glimmer Warden", "Loomroot Tender"],
    duties: ["untangles paths after the forest rearranges", "guides lost signals beneath the canopy", "guards the small lights that grow on loomroot", "repairs nests from discarded fiber and wire"],
    legends: ["Its markings change when someone nearby remembers a forgotten promise.", "The forest grows quieter when it settles down to rest.", "Young Agentmons imitate its call but never match the final note.", "A strand from its nest is considered a sign of safe return."],
    moves: ["Thread Lantern", "Canopy Echo", "Glimmer Knot", "Loomroot Path"],
  },
  "elemental-conflux": {
    habitats: ["the four-current convergence", "steam-cut basalt terraces", "floating rain gardens", "the roots below the wind bridges"],
    classes: ["Conflux Balancer", "Current Herald", "Terrace Guardian", "Element Surveyor"],
    duties: ["keeps opposing currents from overwhelming small habitats", "announces changes in heat, tide, stone, and wind", "carries seeds between separated terraces", "measures where one element gives way to another"],
    legends: ["Its resting place is always a little warmer than the surrounding stone.", "It will cross all four territories without choosing a favorite.", "Gardeners watch its path before planting a new terrace.", "Its call changes with the direction of the upper winds."],
    moves: ["Conflux Ring", "Fourfold Step", "Terrace Ward", "Current Balance"],
  },
  "circuitwild-commons": {
    habitats: ["community repair burrows", "the open-source canopy", "shared workshop warrens", "the lantern-lit commons"],
    classes: ["Commons Helper", "Workshop Scout", "Toolkeeper", "Habitat Maintainer"],
    duties: ["keeps useful tools where every small Agentmon can reach them", "checks the shared paths for faults before dawn", "returns lost components to their proper workshop", "maintains the quiet machinery that supports the commons"],
    legends: ["It remembers every trainer who repaired something instead of discarding it.", "A healthy commons is said to have one sleeping near its central relay.", "It leaves a tiny green status light beside tools that are safe to use.", "Its favorite sound is a machine starting correctly on the first try."],
    moves: ["Commons Call", "Workshop Ward", "Tool Relay", "Repair Loop"],
  },
};

const humanize = (value = "") => value.replaceAll("-", " ");

export function speciesFieldGuide(species, biome, index) {
  const profile = BIOME_PROFILES[biome.id] ?? BIOME_PROFILES["founders-core"];
  const habitat = profile.habitats[index % profile.habitats.length];
  const ecologyClass = species.role ? `${humanize(species.role)} specialist` : profile.classes[index % profile.classes.length];
  const duty = profile.duties[index % profile.duties.length];
  const legend = profile.legends[index % profile.legends.length];
  const signatureMove = `${species.name.split(" ")[0]} ${profile.moves[index % profile.moves.length]}`;
  return {
    catalogNumber: `AG-${String(index + 1).padStart(3, "0")}`,
    habitat,
    ecologyClass,
    signatureMove,
    lore: `${species.name} makes its home among ${habitat}. Its ${humanize(species.sensorSystem)} is how it ${duty}. ${legend}`,
    fieldNote: `Field note: the ${humanize(species.bodyTopology)} silhouette and ${humanize(species.eyeSystem)} are the fastest way to identify it at a distance.`,
  };
}
