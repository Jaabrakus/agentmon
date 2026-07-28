import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_AGENTMON_REGISTRY = "https://agentmon-lab.tangstacks.chatgpt.site";

function cleanRegistryUrl(value, allowHttp = false) {
  const url = new URL(String(value || DEFAULT_AGENTMON_REGISTRY).trim());
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname);
  if (url.protocol !== "https:" && !(allowHttp && loopback && url.protocol === "http:")) {
    throw new Error("The Agentmon registry must use HTTPS.");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function safeId(value) {
  const text = String(value || "").trim();
  if (!/^[a-zA-Z0-9._:-]{3,128}$/.test(text)) throw new Error("Agentmon identity is not marketplace-safe.");
  return text;
}

function compactDigest(value) {
  const text = String(value || "");
  return /^[a-fA-F0-9]{8,64}$/.test(text) ? text.toUpperCase() : null;
}

function marketplaceEvidence(agentmon) {
  const evidenceDigests = [...new Set((agentmon.proceduralSkills || [])
    .flatMap((procedure) => procedure.evidenceDigests || [])
    .map(compactDigest)
    .filter(Boolean))].sort();
  const arenaRunIds = [...new Set((agentmon.procedureTrials || [])
    .filter((trial) => trial.source === "automatic")
    .map((trial) => String(trial.runId || ""))
    .filter((id) => /^[a-zA-Z0-9._:-]{3,128}$/.test(id)))].sort();
  return { evidenceDigests, arenaRunIds };
}

export function createDesktopMarketplaceService(options) {
  const rootDir = resolve(options.rootDir);
  const engineRoot = resolve(options.engineRoot || rootDir);
  const allowHttp = options.allowHttp === true;
  const fetchImpl = options.fetchImpl || fetch;
  const configPath = resolve(rootDir, ".agentmon/marketplace-device.json");
  let config = null;
  let lastSnapshot = { paired: false, registryUrl: DEFAULT_AGENTMON_REGISTRY, status: "not-paired", authorityOnline: false, head: null, listings: [], ownListing: null, local: null };

  async function loadConfig() {
    if (config) return config;
    try {
      const stored = JSON.parse(await readFile(configPath, "utf8"));
      config = {
        format: "agentmon.marketplace-device/v1",
        registryUrl: cleanRegistryUrl(stored.registryUrl, allowHttp),
        token: String(stored.token || "").trim(),
        deviceId: String(stored.deviceId || "").trim() || null,
        pairedAt: String(stored.pairedAt || "") || null,
      };
      if (config.token.length < 24) config = null;
    } catch {}
    return config;
  }

  async function saveConfig(input) {
    const next = {
      format: "agentmon.marketplace-device/v1",
      registryUrl: cleanRegistryUrl(input.registryUrl, allowHttp),
      token: String(input.token || "").trim(),
      deviceId: String(input.deviceId || "").trim() || null,
      pairedAt: new Date().toISOString(),
    };
    if (next.token.length < 24 || next.token.length > 512) throw new Error("Paste the one-time device token from Agentmon Home.");
    await mkdir(resolve(rootDir, ".agentmon"), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await chmod(configPath, 0o600);
    config = next;
    return status();
  }

  async function localState(slot = "main") {
    const agentmonPath = resolve(rootDir, ".agentmon/roster", slot, "agentmon.json");
    const agentmon = JSON.parse(await readFile(agentmonPath, "utf8"));
    const { buildAgentmonStateCommitment, inspectEconomyEligibility } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/economy/verified-economy.mjs")).href);
    const commitment = buildAgentmonStateCommitment(agentmon);
    const eligibility = inspectEconomyEligibility(agentmon);
    return {
      agentmon,
      commitment,
      eligibility,
      summary: {
        id: safeId(agentmon.id),
        name: String(agentmon.form || agentmon.species || "Agentmon").slice(0, 80),
        species: String(agentmon.species || agentmon.form || "Agentmon").slice(0, 80),
        genesisDNA: String(agentmon.lineage?.genesisDNA || agentmon.dna || "").toUpperCase(),
        stateRoot: commitment.stateRoot,
        eligible: eligibility.eligible,
        taints: eligibility.taints,
      },
    };
  }

  async function registryRequest(path, init = {}) {
    const paired = await loadConfig();
    if (!paired) throw new Error("Pair Agentmon Home with the registry first.");
    const response = await fetchImpl(`${paired.registryUrl}${path}`, {
      ...init,
      headers: { Authorization: `AgentmonDevice ${paired.token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const payload = await response.json().catch(() => ({ error: "The registry returned an invalid response." }));
    if (!response.ok) throw new Error(payload.error || `The registry returned ${response.status}.`);
    return payload;
  }

  async function status(slot = "main") {
    const paired = await loadConfig();
    let local = null;
    try { local = (await localState(slot)).summary; } catch {}
    if (!paired) {
      lastSnapshot = { paired: false, registryUrl: DEFAULT_AGENTMON_REGISTRY, status: local?.eligible === false ? "modded" : "not-paired", authorityOnline: false, head: null, listings: [], ownListing: null, local };
      return lastSnapshot;
    }
    const query = local?.id ? `?agentmon_id=${encodeURIComponent(local.id)}` : "";
    const [remote, market] = await Promise.all([
      registryRequest(`/api/economy/status${query}`),
      registryRequest("/api/economy/marketplace"),
    ]);
    const listings = Array.isArray(market.listings) ? market.listings : [];
    const ownListing = local ? listings.find((listing) => listing.agentmonId === local.id) || null : null;
    let state = local?.eligible === false ? "modded" : (remote.head?.status || "local-unverified");
    if (remote.head && local && remote.head.state_root !== local.stateRoot) state = "local-unverified";
    lastSnapshot = { paired: true, registryUrl: paired.registryUrl, deviceId: paired.deviceId, status: state, authorityOnline: remote.authorityOnline === true, head: remote.head || null, transitions: remote.transitions || [], receipts: remote.receipts || [], listings, ownListing, local };
    return lastSnapshot;
  }

  async function attest(slot = "main") {
    const current = await localState(slot);
    if (!current.eligibility.eligible) throw new Error(`This Agentmon is modded: ${current.eligibility.taints.join(", ")}`);
    let remote = await status(slot);
    if (remote.head?.state_root === current.commitment.stateRoot && remote.head?.status === "verified") return remote;
    const kind = remote.head ? "learning" : "hatch";
    const evidence = marketplaceEvidence(current.agentmon);
    const receipt = {
      format: "agentmon.capture-receipt/v1",
      receiptId: `receipt-${crypto.randomUUID()}`,
      kind,
      agentmonId: current.summary.id,
      species: current.summary.species,
      genesisDNA: current.summary.genesisDNA,
      parentStateRoot: remote.head?.state_root || null,
      childStateRoot: current.commitment.stateRoot,
      ...evidence,
      rawTextStored: false,
      capturedAt: new Date().toISOString(),
      nonce: `nonce-${crypto.randomUUID()}`,
    };
    await registryRequest("/api/economy/attest", { method: "POST", body: JSON.stringify(receipt) });
    return status(slot);
  }

  async function createListing(slot = "main", expiresHours = 72) {
    const current = await status(slot);
    if (current.status !== "verified" || current.head?.state_root !== current.local?.stateRoot) throw new Error("Verify the current local Agentmon state before listing it.");
    await registryRequest("/api/economy/listings", { method: "POST", body: JSON.stringify({ agentmonId: current.local.id, stateRoot: current.local.stateRoot, expiresHours }) });
    return status(slot);
  }

  async function cancelListing(slot = "main") {
    const current = await status(slot);
    if (!current.ownListing?.listingId) throw new Error("This Agentmon has no active listing.");
    await registryRequest("/api/economy/listings/cancel", { method: "POST", body: JSON.stringify({ listingId: current.ownListing.listingId }) });
    return status(slot);
  }

  function browserSummary() {
    return {
      paired: lastSnapshot.paired,
      status: lastSnapshot.status,
      authorityOnline: lastSnapshot.authorityOnline,
      listed: Boolean(lastSnapshot.ownListing),
      listingId: lastSnapshot.ownListing?.listingId || null,
      stateRoot: lastSnapshot.local?.stateRoot || null,
      rawPromptsShared: false,
      credentialsExposedToExtension: false,
    };
  }

  return { pair: saveConfig, status, attest, createListing, cancelListing, browserSummary, configPath };
}
