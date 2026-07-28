import { createHash, createPublicKey, sign, verify } from "node:crypto";

export const PROOF_CERTIFICATE_FORMAT = "agentmon.proof-certificate/v1";

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) { return createHash("sha256").update(canonicalize(value)).digest("hex"); }

export function proofIssuerFingerprint(publicKey) {
  const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").toUpperCase();
}

export function issueProofCertificate(input, issuer) {
  if (!input?.proofId || !input?.agentmonId || !input?.procedureDigest) throw new Error("Proof, Agentmon, and procedure identities are required.");
  if (!issuer?.privateKey || !issuer?.publicKey) throw new Error("An Ed25519 issuer key pair is required.");
  const body = {
    format: PROOF_CERTIFICATE_FORMAT,
    proofId: input.proofId,
    agentmonId: input.agentmonId,
    procedureDigest: input.procedureDigest,
    configDigest: input.configDigest,
    evidenceRoot: input.evidenceRoot,
    taskCount: Number(input.taskCount) || 0,
    automaticStatistics: input.automaticStatistics ?? null,
    humanStatistics: input.humanStatistics ?? null,
    safety: input.safety ?? { passed: false, findings: ["safety status not supplied"] },
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    issuer: { name: issuer.name ?? "Agentmon Proof Runner", fingerprint: proofIssuerFingerprint(issuer.publicKey), publicKey: issuer.publicKey },
    privacy: { rawPromptsIncluded: false, rawOutputsIncluded: false, hiddenReasoningIncluded: false },
  };
  const certificateId = digest(body).slice(0, 40).toUpperCase();
  const signedBody = { ...body, certificateId };
  const signature = sign(null, Buffer.from(canonicalize(signedBody)), issuer.privateKey).toString("base64");
  return { ...signedBody, signature };
}

export function verifyProofCertificate(certificate) {
  if (certificate?.format !== PROOF_CERTIFICATE_FORMAT) throw new Error("Unsupported proof certificate format.");
  const { signature, ...body } = certificate;
  if (proofIssuerFingerprint(body.issuer?.publicKey ?? "") !== body.issuer?.fingerprint) throw new Error("Proof issuer fingerprint is invalid.");
  const { certificateId, ...unsignedBody } = body;
  if (digest(unsignedBody).slice(0, 40).toUpperCase() !== certificateId) throw new Error("Proof certificate id is invalid.");
  if (!verify(null, Buffer.from(canonicalize(body)), body.issuer.publicKey, Buffer.from(signature ?? "", "base64"))) throw new Error("Proof certificate signature is invalid.");
  if (body.privacy?.rawPromptsIncluded !== false || body.privacy?.rawOutputsIncluded !== false) throw new Error("Proof certificate violates the public privacy boundary.");
  return certificate;
}
