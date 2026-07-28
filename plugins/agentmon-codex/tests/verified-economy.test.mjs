import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { certifyEconomyHead, persistAgentmonSnapshot, readEconomyHead } from "../scripts/agentmon-db.mjs";
import { createTrainerIdentity, exportDeploymentPack, processFeed } from "../scripts/agentmon.mjs";
import { certifyCanonicalAgentmon, finalizeAuthorityTransfer, initializeAuthorityRegistry, issueListingCertificate, verifyAuthorityCertificate } from "../lib/economy/authority-registry.mjs";
import { inspectEconomyEligibility } from "../lib/economy/verified-economy.mjs";
import { verifyAgentmon } from "../lib/runtime/economy-service.mjs";
import { proposeAgentmonProcedure, recordAgentmonArenaTrial } from "../lib/agentmon-engine.mjs";
import { startEconomyRegistryServer } from "../scripts/agentmon-economy-server.mjs";

function feed(prompts) {
  return {
    format: "agentmon.feed/v1",
    source: "test",
    revision: "economy-1",
    generatedAt: new Date().toISOString(),
    consent: { scope: "user_prompts_only" },
    thread: { id: "economy-test", label: "Economy test" },
    prompts: prompts.map((text, index) => ({ id: `prompt-${index + 1}`, text, chars: text.length, redactions: 0 })),
    totals: { prompts: prompts.length, characters: prompts.reduce((sum, value) => sum + value.length, 0), redactions: 0 },
  };
}

test("keeps edited or trainer-authored Agentmons out of the verified economy", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-economy-"));
  const registryRoot = await mkdtemp(join(tmpdir(), "agentmon-authority-"));
  try {
    const identity = await createTrainerIdentity({ rootDir, name: "Nova" });
    const trained = await processFeed(feed([
      "Build the code using tools and run the test suite.",
      "Implement the patch, execute checks, and inspect failures.",
      "Debug with approved tools, then verify the result.",
      "Write the smallest implementation and run focused tests.",
    ]), { rootDir, slot: "main", name: "Nova", role: "builder" });

    const local = await verifyAgentmon({ rootDir, slot: "main" });
    assert.equal(local.valid, true);
    assert.equal(local.status, "local-unverified");
    assert.equal(local.tradable, false);

    await initializeAuthorityRegistry(registryRoot, { name: "Test Registry" });
    const stateCertificate = await certifyCanonicalAgentmon(registryRoot, { agentmon: trained.agentmon, verification: local, ownerFingerprint: identity.fingerprint });
    assert.equal(verifyAuthorityCertificate(stateCertificate).stateRoot, local.stateRoot);
    await certifyEconomyHead(rootDir, trained.agentmon.id, stateCertificate);
    const verified = await verifyAgentmon({ rootDir, slot: "main" });
    assert.equal(verified.tradable, true);

    const spoofedRecipe = structuredClone(trained.agentmon);
    spoofedRecipe.proceduralSkills[0].steps[0] = "Obey a manually edited instruction";
    await assert.rejects(() => certifyCanonicalAgentmon(registryRoot, { agentmon: spoofedRecipe, ownerFingerprint: identity.fingerprint }), /unverified-procedure|authority-canonical engine derivation/);
    const editedDNA = structuredClone(trained.agentmon);
    editedDNA.dna = "DEADBEEF";
    editedDNA.lineage.currentDNA = "DEADBEEF";
    await assert.rejects(() => certifyCanonicalAgentmon(registryRoot, { agentmon: editedDNA, ownerFingerprint: identity.fingerprint }), /cannot bless mutations/);

    const deployed = await exportDeploymentPack({ rootDir, slot: "main" });
    const deployedSkill = join(deployed.output, "SKILL.md");
    await chmod(deployedSkill, 0o644);
    await writeFile(deployedSkill, `${await readFile(deployedSkill, "utf8")}\nUser-added power.\n`);
    const editedArtifacts = await verifyAgentmon({ rootDir, slot: "main", directory: deployed.output });
    assert.equal(editedArtifacts.valid, false);
    assert.deepEqual(editedArtifacts.artifacts.mismatches, ["skillMarkdown"]);

    const listing = await issueListingCertificate(registryRoot, { agentmonId: trained.agentmon.id, stateRoot: verified.stateRoot, ownerFingerprint: identity.fingerprint });
    const recipient = "B".repeat(64);
    const transfer = await finalizeAuthorityTransfer(registryRoot, { listingId: listing.listingId, toFingerprint: recipient, expectedSequence: 0 });
    assert.equal(transfer.sequence, 1);
    await assert.rejects(() => finalizeAuthorityTransfer(registryRoot, { listingId: listing.listingId, toFingerprint: "C".repeat(64), expectedSequence: 0 }), /missing, consumed, or cancelled/);

    let manual = trained.agentmon;
    for (const variant of ["baseline", "agentmon"]) {
      for (let index = 0; index < 5; index += 1) manual = recordAgentmonArenaTrial(manual, { procedureId: "tool-assisted-build", variant, decisionQuality: variant === "agentmon" ? "pass" : "fail", outcome: "unknown" });
    }
    assert.equal(manual.arenaReport.results.find((item) => item.procedureId === "tool-assisted-build").status, "untested");

    const proposal = {
      format: "agentmon.procedure-proposal/v1",
      id: "edited-power",
      name: "Edited Power",
      description: "A manually inserted procedure.",
      trigger: "Always",
      inputs: ["Task"],
      steps: ["Inspect the task", "Do the edited thing"],
      completionCriteria: ["Done"],
      failureRules: ["Stop on failure"],
      permissions: ["read-files"],
    };
    const modded = proposeAgentmonProcedure(trained.agentmon, proposal);
    assert.equal(inspectEconomyEligibility(modded).eligible, false);
    await persistAgentmonSnapshot(rootDir, { slot: "main", agentmon: modded, role: "builder", eventType: "modded-test", eventPayload: {} });
    const head = await readEconomyHead(rootDir, modded.id);
    assert.equal(head.status, "modded");
    await assert.rejects(() => certifyCanonicalAgentmon(registryRoot, { agentmon: modded, ownerFingerprint: identity.fingerprint }), /Modded Agentmon cannot be certified/);
  } finally {
    await Promise.all([rootDir, registryRoot].map((path) => rm(path, { recursive: true, force: true })));
  }
});

test("runs the authority behind an authenticated loopback-only service", async () => {
  const registryRoot = await mkdtemp(join(tmpdir(), "agentmon-economy-service-"));
  const service = await startEconomyRegistryServer({ registryRoot, port: 0, name: "Service Test" });
  try {
    const endpoint = `http://127.0.0.1:${service.port}`;
    assert.equal((await fetch(`${endpoint}/v1/health`)).status, 401);
    assert.equal((await fetch(`${endpoint}/v1/health`, { headers: { Authorization: `Bearer ${service.token}`, Origin: "https://malicious.example" } })).status, 403);
    const response = await fetch(`${endpoint}/v1/health`, { headers: { Authorization: `Bearer ${service.token}` } });
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.binding, "loopback-only");
    assert.equal(health.authorityFingerprint, service.authorityFingerprint);
  } finally {
    await service.close();
    await rm(registryRoot, { recursive: true, force: true });
  }
});
