import { visualDigest } from "./phenotype-engine.mjs";

export const VISUAL_LINEAGE_FORMAT = "agentmon.visual-lineage/v2";
const LEGACY_FORMAT = "agentmon.visual-lineage/v1";

function legacyCompatible(previous, phenotype) {
  const legacyIdentity = previous.forms?.at(-1)?.identity;
  if (!legacyIdentity) return false;
  return Object.entries(legacyIdentity).every(([key, value]) => phenotype.identity[key] === value);
}

function compactForm(phenotype, reason, recordedAt) {
  return {
    formDigest: phenotype.digest,
    currentDNA: phenotype.genome.currentDNA,
    generation: phenotype.genome.generation,
    form: phenotype.form,
    identity: phenotype.identity,
    palette: phenotype.palette,
    mutation: phenotype.mutation,
    equipment: phenotype.equipment,
    reason,
    recordedAt,
  };
}

export function updateVisualLineage(existing, phenotype, options = {}) {
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const reason = options.reason ?? (phenotype.genome.generation > 1 ? "evolution" : "hatch");
  const previous = [VISUAL_LINEAGE_FORMAT, LEGACY_FORMAT].includes(existing?.format) ? existing : null;
  const forms = [...(previous?.forms ?? [])];
  if (!forms.some((form) => form.formDigest === phenotype.digest)) {
    forms.push(compactForm(phenotype, reason, recordedAt));
  }
  const lineage = {
    format: VISUAL_LINEAGE_FORMAT,
    agentmonId: phenotype.agentmonId,
    genesisDNA: phenotype.genome.genesisDNA,
    identityLock: visualDigest(phenotype.identity),
    identityLockHistory: [...(previous?.identityLockHistory ?? [])],
    currentFormDigest: phenotype.digest,
    forms,
  };
  if (previous) {
    if (previous.agentmonId !== lineage.agentmonId || previous.genesisDNA !== lineage.genesisDNA) {
      throw new Error("Visual lineage cannot be reassigned to another Agentmon.");
    }
    if (previous.identityLock !== lineage.identityLock) {
      if (previous.format !== LEGACY_FORMAT || !legacyCompatible(previous, phenotype)) {
        throw new Error("Permanent visual identity changed outside an evolution rule.");
      }
      lineage.identityLockHistory.push({ format: LEGACY_FORMAT, identityLock: previous.identityLock, migratedAt: recordedAt });
    }
    const lastGeneration = previous.forms.at(-1)?.generation ?? 0;
    if (phenotype.genome.generation < lastGeneration) throw new Error("Visual generation cannot move backward.");
  }
  return { ...lineage, digest: visualDigest(lineage) };
}

export function verifyVisualLineage(lineage) {
  if (lineage?.format !== VISUAL_LINEAGE_FORMAT) throw new Error("Unsupported visual lineage format.");
  const { digest, ...unsigned } = lineage;
  if (visualDigest(unsigned) !== digest) throw new Error("Visual lineage integrity check failed.");
  for (let index = 1; index < lineage.forms.length; index += 1) {
    if (lineage.forms[index].generation < lineage.forms[index - 1].generation) {
      throw new Error("Visual lineage generations are not monotonic.");
    }
  }
  return lineage;
}
