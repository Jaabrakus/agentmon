import { createHash } from "node:crypto";

export const OWNERSHIP_HEAD_FORMAT = "agentmon.ownership-head/v1";

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(canonicalize(value)).digest("hex"); }
function fingerprint(value, label) { const normalized = String(value ?? "").toUpperCase(); if (!/^[A-F0-9]{64}$/.test(normalized)) throw new Error(`${label} must be a 64-character fingerprint.`); return normalized; }

function seal(head) {
  const unsigned = { ...head }; delete unsigned.headDigest;
  return { ...unsigned, headDigest: digest(unsigned) };
}

export function createOwnershipHead(input) {
  const now = input.createdAt ?? new Date().toISOString();
  return seal({
    format: OWNERSHIP_HEAD_FORMAT,
    creatureId: String(input.creatureId),
    genesisDNA: String(input.genesisDNA),
    currentDNA: String(input.currentDNA),
    sequence: 0,
    status: "active",
    ownerFingerprint: fingerprint(input.ownerFingerprint, "Owner"),
    pendingTransfer: null,
    dispute: null,
    revocation: null,
    recovery: null,
    updatedAt: now,
    events: [{ type: "genesis", at: now, actor: fingerprint(input.ownerFingerprint, "Owner") }],
  });
}

export function verifyOwnershipHead(head) {
  if (head?.format !== OWNERSHIP_HEAD_FORMAT) throw new Error("Unsupported ownership head format.");
  const { headDigest, ...unsigned } = head;
  if (digest(unsigned) !== headDigest) throw new Error("Ownership head integrity failed.");
  return head;
}

export function applyOwnershipCommand(current, command) {
  verifyOwnershipHead(current);
  if (command.expectedSequence !== current.sequence || command.expectedHeadDigest !== current.headDigest) throw new Error("Ownership compare-and-swap conflict.");
  const actor = fingerprint(command.actorFingerprint, "Actor");
  const at = command.at ?? new Date().toISOString();
  const requireOwner = () => { if (actor !== current.ownerFingerprint) throw new Error("Only the current owner may perform this action."); };
  let next = { ...current, sequence: current.sequence + 1, updatedAt: at, events: [...current.events] };
  delete next.headDigest;
  if (command.type === "propose-transfer") {
    requireOwner();
    if (current.status !== "active") throw new Error("Ownership must be active to start a transfer.");
    const recipientFingerprint = fingerprint(command.recipientFingerprint, "Recipient");
    next.status = "pending-transfer";
    next.pendingTransfer = { transferId: String(command.transferId), fromFingerprint: actor, recipientFingerprint, expiresAt: String(command.expiresAt) };
  } else if (command.type === "accept-transfer") {
    if (current.status !== "pending-transfer" || actor !== current.pendingTransfer?.recipientFingerprint) throw new Error("Only the intended recipient may accept this pending transfer.");
    if (Date.parse(current.pendingTransfer.expiresAt) <= Date.parse(at)) throw new Error("Pending transfer has expired.");
    next.ownerFingerprint = actor; next.status = "active"; next.pendingTransfer = null;
  } else if (command.type === "cancel-transfer") {
    requireOwner();
    if (current.status !== "pending-transfer") throw new Error("No transfer is pending.");
    next.status = "active"; next.pendingTransfer = null;
  } else if (command.type === "open-dispute") {
    if (![current.ownerFingerprint, current.pendingTransfer?.recipientFingerprint].includes(actor)) throw new Error("Actor has no standing to dispute this ownership head.");
    if (current.status === "revoked") throw new Error("A revoked head cannot enter dispute.");
    next.status = "disputed"; next.dispute = { disputeId: String(command.disputeId), openedBy: actor, reasonCode: String(command.reasonCode), status: "open" };
  } else if (command.type === "resolve-dispute") {
    if (current.status !== "disputed" || actor !== fingerprint(command.authorityFingerprint, "Authority")) throw new Error("Authorized dispute resolution is required.");
    next.ownerFingerprint = fingerprint(command.ownerFingerprint, "Resolved owner"); next.status = "active"; next.pendingTransfer = null; next.dispute = { ...current.dispute, status: "resolved", resolvedBy: actor };
  } else if (command.type === "revoke") {
    if (actor !== fingerprint(command.authorityFingerprint, "Authority")) throw new Error("Authorized revocation is required.");
    next.status = "revoked"; next.pendingTransfer = null; next.revocation = { reasonCode: String(command.reasonCode), revokedBy: actor, at };
  } else if (command.type === "recover") {
    if (actor !== fingerprint(command.recoveryAuthorityFingerprint, "Recovery authority")) throw new Error("Authorized recovery is required.");
    if (!["active", "disputed"].includes(current.status)) throw new Error("This ownership state cannot be recovered.");
    next.ownerFingerprint = fingerprint(command.newOwnerFingerprint, "Recovered owner"); next.status = "active"; next.pendingTransfer = null; next.recovery = { recoveredBy: actor, priorOwnerFingerprint: current.ownerFingerprint, evidenceDigest: String(command.evidenceDigest), at };
  } else throw new Error(`Unknown ownership command: ${command.type}`);
  next.events.push({ type: command.type, at, actor, commandDigest: digest(command) });
  return seal(next);
}
