import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createDesktopMarketplaceService } from "../desktop-app/desktop-marketplace-service.mjs";
import { canonicalProcedureProvenance } from "../lib/agentmon-engine.mjs";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("desktop marketplace keeps the device token local and exposes only redacted browser status", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-marketplace-"));
  await mkdir(join(rootDir, ".agentmon/roster"), { recursive: true });
  await cp(join(pluginRoot, ".agentmon/roster/main"), join(rootDir, ".agentmon/roster/main"), { recursive: true });
  const agentmonPath = join(rootDir, ".agentmon/roster/main/agentmon.json");
  const eligibleAgentmon = JSON.parse(await readFile(agentmonPath, "utf8"));
  eligibleAgentmon.proceduralSkills = (eligibleAgentmon.proceduralSkills || []).filter((procedure) => canonicalProcedureProvenance(procedure) !== "untrusted");
  eligibleAgentmon.skillPackages = [];
  await writeFile(agentmonPath, `${JSON.stringify(eligibleAgentmon, null, 2)}\n`);
  const deviceToken = "device-secret-that-must-never-reach-chrome-001";
  let head = null;
  let listing = null;
  const registry = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    assert.equal(request.headers.authorization, `AgentmonDevice ${deviceToken}`);
    response.setHeader("Content-Type", "application/json");
    if (request.url?.startsWith("/api/economy/status")) return response.end(JSON.stringify({ authorityOnline: true, head, receipts: [], transitions: [] }));
    if (request.url === "/api/economy/marketplace") return response.end(JSON.stringify({ listings: listing ? [listing] : [] }));
    if (request.url === "/api/economy/attest") {
      assert.equal(input.rawTextStored, false);
      assert.equal(Object.hasOwn(input, "prompt"), false);
      head = { id: input.agentmonId, species: input.species, state_root: input.childStateRoot, status: "verified", transition_sequence: 0 };
      response.statusCode = 201;
      return response.end(JSON.stringify({ status: "attested" }));
    }
    if (request.url === "/api/economy/listings") {
      listing = { listingId: "listing-test-001", agentmonId: input.agentmonId, species: head.species, stateRoot: input.stateRoot, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), owned: true };
      response.statusCode = 201;
      return response.end(JSON.stringify(listing));
    }
    if (request.url === "/api/economy/listings/cancel") {
      listing = null;
      return response.end(JSON.stringify({ status: "cancelled" }));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolvePromise) => registry.listen(0, "127.0.0.1", resolvePromise));
  const registryUrl = `http://127.0.0.1:${registry.address().port}`;
  const service = createDesktopMarketplaceService({ rootDir, engineRoot: pluginRoot, allowHttp: true });
  try {
    let snapshot = await service.pair({ registryUrl, token: deviceToken });
    assert.equal(snapshot.paired, true);
    assert.equal(snapshot.status, "local-unverified");
    const config = await readFile(service.configPath, "utf8");
    assert.match(config, new RegExp(deviceToken));
    assert.equal((await stat(service.configPath)).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(service.browserSummary()), new RegExp(deviceToken));
    assert.equal(service.browserSummary().credentialsExposedToExtension, false);

    snapshot = await service.attest();
    assert.equal(snapshot.status, "verified");
    snapshot = await service.createListing();
    assert.equal(snapshot.ownListing.listingId, "listing-test-001");
    assert.equal(service.browserSummary().listed, true);
    snapshot = await service.cancelListing();
    assert.equal(snapshot.ownListing, null);
  } finally {
    await new Promise((resolvePromise) => registry.close(resolvePromise));
    await chmod(rootDir, 0o700).catch(() => {});
    await rm(rootDir, { recursive: true, force: true });
  }
});
