import { hashText } from "./math";
import type { Agentmon, NameForgeProfile, TraitKey } from "./types";

type NameSoundPack = { id: string; onsets: string[]; vowels: string[]; codas: string[]; templates: string[] };

// These packs combine broad cross-linguistic sound shapes rather than copying words
// from any one culture. They are intentionally ASCII-safe for portable identifiers.
const nameSoundPacks: NameSoundPack[] = [
  { id: "open-vowel", onsets: ["m", "n", "p", "t", "k", "l", "s"], vowels: ["a", "e", "i", "o", "u"], codas: ["", "n"], templates: ["CV", "CVV"] },
  { id: "sonorant-flow", onsets: ["l", "r", "m", "n", "w", "y"], vowels: ["a", "e", "i", "o", "u", "ai"], codas: ["l", "r", "n", ""], templates: ["CVF", "CV"] },
  { id: "nasal-rhythm", onsets: ["m", "n", "ny", "ng", "b", "d"], vowels: ["a", "i", "u", "o"], codas: ["m", "n", "ng", ""], templates: ["CVF", "VC"] },
  { id: "dorsal-edge", onsets: ["k", "g", "kh", "q", "h"], vowels: ["a", "e", "o", "u", "ae"], codas: ["k", "q", "r", ""], templates: ["CVF", "CV"] },
  { id: "coronal-spark", onsets: ["t", "d", "s", "z", "sh", "ch", "ts"], vowels: ["a", "e", "i", "o"], codas: ["t", "s", "n", ""], templates: ["CVF", "CV"] },
  { id: "labial-pulse", onsets: ["p", "b", "f", "v", "m"], vowels: ["a", "e", "i", "o", "u"], codas: ["p", "m", "v", ""], templates: ["CVF", "CV"] },
  { id: "liquid-cluster", onsets: ["br", "dr", "kr", "pl", "tr", "vr", "sk"], vowels: ["a", "e", "i", "o", "u"], codas: ["r", "l", "n", ""], templates: ["CVF", "CV"] },
  { id: "vowel-weave", onsets: ["", "h", "y", "w", "l"], vowels: ["ai", "au", "ei", "ia", "oa", "ui"], codas: ["n", "l", "", "s"], templates: ["VF", "CV"] },
  { id: "breath-line", onsets: ["h", "sh", "th", "f", "s"], vowels: ["a", "e", "i", "o", "u"], codas: ["h", "s", "", "n"], templates: ["CV", "CVF"] },
  { id: "retroflex-color", onsets: ["r", "zh", "dh", "tr", "d"], vowels: ["a", "i", "u", "e"], codas: ["r", "t", "n", ""], templates: ["CVF", "CV"] },
  { id: "island-cadence", onsets: ["m", "n", "l", "r", "p", "t", "k", "v"], vowels: ["a", "e", "i", "o", "u"], codas: [""], templates: ["CV", "CVV"] },
  { id: "compact-coda", onsets: ["b", "d", "g", "k", "s", "z", "m", "n"], vowels: ["a", "e", "i", "o", "u"], codas: ["k", "t", "m", "n", "s"], templates: ["CVF", "VF"] },
];

const nameTraitPackBias: Record<TraitKey, string[]> = {
  reasoning: ["liquid-cluster", "compact-coda", "sonorant-flow"],
  curiosity: ["vowel-weave", "open-vowel", "coronal-spark"],
  reliability: ["compact-coda", "nasal-rhythm", "dorsal-edge"],
  initiative: ["coronal-spark", "labial-pulse", "liquid-cluster"],
  empathy: ["sonorant-flow", "island-cadence", "open-vowel"],
  toolcraft: ["dorsal-edge", "liquid-cluster", "labial-pulse"],
};

const blockedNameFragments = ["pokemon", "pikachu", "openai", "chatgpt", "fuck", "shit"];

function namePick<T>(items: T[], seed: string, salt: string): T {
  return items[hashText(`${seed}|${salt}`) % items.length];
}

function forgeSyllable(pack: NameSoundPack, seed: string, index: number) {
  const template = namePick(pack.templates, seed, `template-${index}`);
  const onset = namePick(pack.onsets, seed, `onset-${index}`);
  const vowel = namePick(pack.vowels, seed, `vowel-${index}`);
  const coda = namePick(pack.codas, seed, `coda-${index}`);
  const syllable = [...template].map((token) => token === "C" ? onset : token === "V" ? vowel : coda).join("");
  return { syllable, template };
}

function normalizeForgedName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z]/g, "").replace(/(.)\1\1+/g, "$1$1").slice(0, 11);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function isPortablePronounceable(name: string) {
  const lower = name.toLowerCase();
  const vowelCount = (lower.match(/[aeiouy]/g) || []).length;
  return lower.length >= 4
    && lower.length <= 11
    && vowelCount >= 2
    && !/^ng|^ny/.test(lower)
    && !/q(?!u)/.test(lower)
    && !/[bcdfghjklmnpqrstvwxyz]{4}/.test(lower)
    && !/[aeiou]{4}/.test(lower)
    && !/(?:hv|vh|qk|kq|hsh|shh|zhh|thh)/.test(lower);
}

export function forgeAgentmonName(seed: string, primary: TraitKey, secondary: TraitKey, attempt = 0): NameForgeProfile {
  const effectiveSeed = `${seed}|${primary}|${secondary}|${attempt}`;
  const biasedIds = [...nameTraitPackBias[primary], ...nameTraitPackBias[secondary]];
  const biasedPacks = biasedIds.map((id) => nameSoundPacks.find((pack) => pack.id === id)).filter(Boolean) as NameSoundPack[];
  const syllableCount = 2 + (hashText(`${effectiveSeed}|length`) % 2);
  const soundPacks: string[] = [];
  const templates: string[] = [];
  const syllables: string[] = [];
  for (let index = 0; index < syllableCount; index += 1) {
    const pool = index === 0 ? biasedPacks : nameSoundPacks;
    const pack = namePick(pool, effectiveSeed, `pack-${index}`);
    const rendered = forgeSyllable(pack, effectiveSeed, index);
    soundPacks.push(pack.id);
    templates.push(rendered.template);
    syllables.push(rendered.syllable);
  }
  let name = normalizeForgedName(syllables.join(""));
  if (!isPortablePronounceable(name) || blockedNameFragments.some((fragment) => name.toLowerCase().includes(fragment))) {
    if (attempt >= 12) name = `Mon${hashText(effectiveSeed).toString(36).slice(0, 6)}`;
    else return forgeAgentmonName(seed, primary, secondary, attempt + 1);
  }
  return {
    format: "agentmon.nameforge/v1",
    generatorVersion: "1.0",
    name,
    seedDigest: hashText(effectiveSeed).toString(16).padStart(8, "0").toUpperCase(),
    soundPacks,
    templates,
    syllables,
    asciiSkeleton: name.toLowerCase(),
    moderation: "unreviewed",
  };
}

export function generateAgentmonNameCandidates(agentmon: Agentmon, count = 12): NameForgeProfile[] {
  const primary = agentmon.traitKey;
  const secondary = (Object.entries(agentmon.traits) as Array<[TraitKey, number]>)
    .filter(([trait]) => trait !== primary)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? primary;
  const seen = new Set<string>();
  const candidates: NameForgeProfile[] = [];
  for (let index = 0; candidates.length < Math.max(1, Math.min(50, count)) && index < count * 8; index += 1) {
    const candidate = forgeAgentmonName(`${agentmon.lineage?.genesisDNA ?? agentmon.dna}|${agentmon.trainerName}|candidate-${index}`, primary, secondary);
    if (!seen.has(candidate.asciiSkeleton)) {
      seen.add(candidate.asciiSkeleton);
      candidates.push(candidate);
    }
  }
  return candidates;
}

export function reforgeAgentmonName(agentmon: Agentmon, candidateNumber = 1) {
  const boundedCandidate = Math.max(1, Math.min(50, Math.floor(candidateNumber)));
  const profile = generateAgentmonNameCandidates(agentmon, boundedCandidate)[boundedCandidate - 1];
  if (!profile) throw new Error(`Could not forge name candidate ${boundedCandidate}.`);
  const previousName = agentmon.form ?? agentmon.species;
  const form = !agentmon.form || agentmon.form === agentmon.species ? profile.name : agentmon.form.replace(agentmon.species, profile.name);
  return {
    ...agentmon,
    species: profile.name,
    form,
    nameForge: profile,
    trainedAt: new Date().toISOString(),
    nameHistory: [...(agentmon.nameHistory ?? []), { name: previousName, at: agentmon.trainedAt }],
  };
}
