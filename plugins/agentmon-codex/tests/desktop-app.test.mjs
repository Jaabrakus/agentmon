import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import test from "node:test";
import { startDesktopBrowserServer } from "../desktop-app/desktop-browser-server.mjs";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "../desktop-app");
const projectRoot = join(desktopDir, "../../..");

async function artifactBytes(directory) {
  const chunks = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(...await artifactBytes(path));
    else if (entry.isFile()) chunks.push(await readFile(path));
  }
  return chunks;
}

test("desktop app controls the existing local companion without adding prompt storage", async () => {
  const controller = (await Promise.all(["AgentmonController.swift", "AgentmonController+Browser.swift", "AgentmonController+CodexPlugin.swift", "AgentmonController+LocalModel.swift", "AgentmonController+PixelSnap.swift"].map((name) => readFile(join(desktopDir, name), "utf8")))).join("\n");
  const views = `${await readFile(join(desktopDir, "AgentmonViews.swift"), "utf8")}\n${await readFile(join(desktopDir, "AgentmonPanels.swift"), "utf8")}`;
  assert.match(controller, /agentmon-desktop-companion\.mjs/);
  assert.match(controller, /agentmon-premium-egg\.png/);
  assert.match(controller, /127\.0\.0\.1:4765/);
  assert.doesNotMatch(controller, /promptText|rawPrompt|INSERT INTO|WebKit/);
  assert.match(controller, /agentmon-lab\.tangstacks\.chatgpt\.site/);
  assert.match(views, /RAW BROWSER PROMPTS: MEMORY ONLY/);
  assert.match(controller, /EXTENSION CONNECTED/);
  assert.match(views, /PROMPT CAPTURE ON/);
  assert.match(views, /SignalLightView/);
  assert.match(views, /PixelLeafView/);
  assert.match(views, /NO AGENTMON LOADED FROM THIS PROJECT/);
  assert.match(views, /CFBundleShortVersionString/);
  assert.match(views, /SIGNAL STRENGTH/);
  assert.match(views, /NEXT EVOLUTION/);
  assert.match(views, /ARENA TESTED/);
  assert.match(views, /PERMANENT DNA/);
  assert.match(views, /PIXEL SNAP/);
  assert.match(views, /REAL OUTCOMES/);
  assert.match(views, /FIRST WIN LOOP/);
  assert.match(views, /Turn Agentmon Mode on in the extension/);
  assert.match(views, /click Helped or Missed on its receipt/);
  assert.match(views, /\/agentmon helped/);
  assert.match(views, /\/agentmon auto main/);
  assert.match(views, /LIVE PREVIEW/);
  assert.match(views, /ADVANCED · REBUILD FULL ART PACK/);
  assert.match(views, /CANCEL CATALOG REBUILD/);
  assert.match(views, /controller\.previewPixelSnapStrength/);
  assert.match(controller, /no progress for 2 minutes/);
  assert.match(controller, /cancelPixelSnapCatalogRebuild/);
  assert.match(controller, /AGENTMON_PROGRESS/);
  assert.match(controller, /build-trait-visual-pack\.mjs/);
  assert.match(controller, /--snap-strength/);
  assert.match(controller, /AGENTMON_SHARP_MODULE/);
  assert.match(controller, /ChromeExtension\.installing/);
  assert.match(controller, /applicationSupportDirectory/);
  assert.match(controller, /installChromeExtension/);
  assert.match(views, /GET EXTENSION/);
  assert.match(controller, /installCodexPlugin/);
  assert.match(controller, /inspectCodexPluginInstallation/);
  assert.match(controller, /agentmon-codex@agentmon-local/);
  assert.match(controller, /plugin", "marketplace", "add/);
  assert.match(controller, /plugin", "add/);
  assert.match(controller, /deploy", "--slot", "main/);
  assert.match(views, /INSTALL CODEX PLUGIN/);
  assert.match(views, /controller\.inspectCodexPluginInstallation/);
  assert.match(views, /@agentmon-companion/);
  assert.match(views, /ACTION AGENTMON · STAKES ENGINE/);
  assert.match(views, /CHECK · CALL · RAISE · STAY · FOLD · BLUFF/);
  assert.match(views, /Action Learning is off/);
  assert.match(controller, /actionLearningEnabled/);
  assert.match(controller, /actionBattleState/);
  assert.match(views, /LOCAL AGENT RUNTIME · DEVICE-ONLY CHAT/);
  assert.match(views, /MARKETPLACE · VERIFIED AGENTMON ECONOMY/);
  assert.match(views, /Chrome never receives market credentials/);
  assert.match(views, /AUTO-DETECT/);
  assert.match(views, /ASK LOCALLY WITH AGENTMON/);
  assert.match(controller, /autoDetectLocalAgents/);
  assert.match(controller, /127\.0\.0\.1:11434\/v1/);
  assert.match(controller, /127\.0\.0\.1:1234\/v1/);
  assert.match(views, /Legacy \.agentmon\/feeds\/main\.json still exists/);
});

test("desktop build embeds the premium pixel egg instead of relying on a system placeholder", async () => {
  const build = await readFile(join(desktopDir, "build-desktop-app.mjs"), "utf8");
  assert.match(build, /public\/agentmon-sprites\/genesis-egg-v2\.png/);
  assert.match(build, /Resources\/browser-extension/);
  assert.match(build, /Resources\/desktop-action-routes\.mjs/);
  assert.match(build, /Resources\/desktop-model-provider-routes\.mjs/);
  assert.match(build, /Resources\/desktop-marketplace-service\.mjs/);
  assert.match(build, /Resources\/desktop-downlink-service\.mjs/);
  assert.match(build, /Resources\/agentmon-premium-egg\.png/);
  assert.match(build, /Resources\/node_modules/);
  assert.match(build, /sharp-libvips-darwin-arm64/);
  assert.match(build, /@img\/colour/);
  assert.match(build, /"semver"/);
  assert.match(build, /sharp\/node_modules\/\.bin/);
  assert.match(build, /cleanDistribution/);
  assert.match(build, /signDistribution/);
  assert.match(build, /sourceSnapshot/);
  assert.match(build, /AgentmonController\+CodexPlugin\.swift/);
});

test("desktop server pairs Chrome and keeps prompt text out of every local artifact", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-desktop-"));
  const origin = "chrome-extension://desktoptest";
  const localModel = createServer(async (request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "test-local-agent" }] }));
      return;
    }
    for await (const _chunk of request) {}
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "Private local response" } }] }));
  });
  await new Promise((resolvePromise) => localModel.listen(0, "127.0.0.1", resolvePromise));
  const localBaseUrl = `http://127.0.0.1:${localModel.address().port}/v1`;
  const server = await startDesktopBrowserServer({ rootDir, engineRoot: projectRoot, port: 0, pairingCode: "DESKTOP-PAIR" });
  const endpoint = `http://127.0.0.1:${server.port}`;
  try {
    const pair = await (await fetch(`${endpoint}/v1/browser/pair`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ code: "DESKTOP-PAIR" }) })).json();
    const headers = { Origin: origin, Authorization: `Bearer ${pair.token}`, "Content-Type": "application/json" };
    const siteState = await fetch(`${endpoint}/v1/browser/site-state`, { method: "POST", headers, body: JSON.stringify({ site: "chatgpt.com", enabled: true }) });
    assert.equal(siteState.status, 200);
    const privatePhrase = "DESKTOP-RAW-FREE-ORCHID-7722";
    const ingest = await fetch(`${endpoint}/v1/browser/ingest`, { method: "POST", headers, body: JSON.stringify({ site: "chatgpt.com", conversation: "test", eventId: "event-1", content: `Build ${privatePhrase} with modular tools and tests.` }) });
    assert.equal(ingest.status, 200);
    const routePhrase = "DESKTOP-TRANSIENT-ROUTE-EMBER-9931";
    const routed = await (await fetch(`${endpoint}/v1/browser/route`, { method: "POST", headers, body: JSON.stringify({ site: "chatgpt.com", slot: "main", conversation: "test", content: `Implement ${routePhrase} safely.` }) })).json();
    assert.equal(routed.privacy.rawPromptStored, false);
    assert.doesNotMatch(JSON.stringify(routed), new RegExp(routePhrase));
    assert.equal(routed.downlink.format, "agentmon.downlink/v3");
    assert.ok(routed.downlink.identity?.permanentArchetype);
    assert.ok(routed.downlink.identity?.resonance?.mode);
    assert.match(routed.downlink.packet, /IDENTITY LENS/);
    assert.equal(routed.downlink.privacy.toolPermissionsGrantedByAgentmon, false);
    const activation = await (await fetch(`${endpoint}/v1/browser/activate`, { method: "POST", headers, body: JSON.stringify({ action: "use", slot: "main", conversation: "test" }) })).json();
    assert.equal(activation.active, true);
    assert.equal(activation.privacy.rawPromptsIncluded, false);
    assert.doesNotMatch(activation.packet, /DESKTOP-RAW-FREE-ORCHID-7722/);
    const status = await (await fetch(`${endpoint}/v1/desktop/status?slot=main`, { headers: { Authorization: `Bearer ${server.token}` } })).json();
    assert.equal(status.browser.paired, true);
    assert.equal(status.browser.site, "chatgpt.com");
    assert.equal(status.browser.siteEnabled, true);
    assert.ok(status.browser.lastPromptAt);
    assert.equal(status.browser.promptCount, 1);
    assert.deepEqual(status.browser.sites.map((item) => item.site), ["chatgpt.com"]);
    assert.ok(status.browser.activeAgentmon);
    assert.equal(status.intake.observed, "submitted-user-prompts-only");
    assert.equal(status.effectiveness.totalOutcomes, 0);
    assert.equal(status.privacy.rawBrowserPromptsStored, false);
    const browserStatus = await (await fetch(`${endpoint}/v1/browser/status`, { headers })).json();
    assert.equal(browserStatus.marketplace.credentialsExposedToExtension, false);
    assert.equal(Object.hasOwn(browserStatus.marketplace, "token"), false);
    const forbiddenMarketplace = await fetch(`${endpoint}/v1/desktop/marketplace/status`, { headers });
    assert.equal(forbiddenMarketplace.status, 403);
    const desktopHeaders = { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" };
    const localStatus = await (await fetch(`${endpoint}/v1/desktop/local-model/status?baseUrl=${encodeURIComponent(localBaseUrl)}`, { headers: desktopHeaders })).json();
    assert.deepEqual(localStatus.models, ["test-local-agent"]);
    const connected = await (await fetch(`${endpoint}/v1/desktop/local-model/connect`, { method: "POST", headers: desktopHeaders, body: JSON.stringify({ baseUrl: localBaseUrl, model: "test-local-agent" }) })).json();
    assert.equal(connected.connected, true);
    const localPrivatePhrase = "LOCAL-CHAT-RAW-FREE-COMET-5501";
    const localChat = await (await fetch(`${endpoint}/v1/desktop/local-model/chat`, { method: "POST", headers: desktopHeaders, body: JSON.stringify({ slot: "main", prompt: localPrivatePhrase }) })).json();
    assert.equal(localChat.answer, "Private local response");
    assert.equal(localChat.mode, "agentmon");
    assert.ok(localChat.receipt.identity);
    assert.equal(localChat.receipt.delivery.status, "answered-by-local-model");
    assert.equal(localChat.privacy.transport, "loopback-only");
    assert.equal(localChat.privacy.rawPromptStoredByAgentmon, false);
    assert.equal(localChat.privacy.rawHistoryStoredByAgentmon, false);
    const genericChat = await (await fetch(`${endpoint}/v1/desktop/local-model/chat`, { method: "POST", headers: desktopHeaders, body: JSON.stringify({ slot: "main", conversation: "generic-test", prompt: "Give a generic local answer.", agentmonMode: false }) })).json();
    assert.equal(genericChat.mode, "generic");
    assert.equal(genericChat.agentmon, null);
    assert.equal(genericChat.receipt.identity, null);
    const artifacts = Buffer.concat(await artifactBytes(join(rootDir, ".agentmon"))).toString("utf8");
    assert.doesNotMatch(artifacts, /DESKTOP-RAW-FREE-ORCHID-7722/);
    assert.doesNotMatch(artifacts, /DESKTOP-TRANSIENT-ROUTE-EMBER-9931/);
    assert.doesNotMatch(artifacts, /LOCAL-CHAT-RAW-FREE-COMET-5501/);
  } finally {
    await server.close();
    await new Promise((resolvePromise) => localModel.close(resolvePromise));
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("desktop provider feedback is one-time, procedure-bound, and raw-free", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-provider-feedback-"));
  await mkdir(join(rootDir, ".agentmon/roster"), { recursive: true });
  await cp(join(projectRoot, ".agentmon/roster/main"), join(rootDir, ".agentmon/roster/main"), { recursive: true });
  const agentmonPath = join(rootDir, ".agentmon/roster/main/agentmon.json");
  const agentmon = JSON.parse(await readFile(agentmonPath, "utf8"));
  const procedure = agentmon.proceduralSkills.find((candidate) => candidate.id === "focused-implementation");
  assert.ok(procedure, "fixture must contain the canonical focused implementation procedure");
  agentmon.proceduralSkills = [{ ...procedure, trainerConfirmed: true, trainerReview: "confirmed" }];
  agentmon.procedureTrials = Array.from({ length: 5 }, (_, index) => [
    { id: `feedback-baseline-${index}`, procedureId: procedure.id, variant: "baseline", decisionQuality: "fail", outcome: "failure", recordedAt: `2026-01-01T00:00:0${index}.000Z`, source: "automatic", runId: `feedback-baseline-${index}` },
    { id: `feedback-agentmon-${index}`, procedureId: procedure.id, variant: "agentmon", decisionQuality: "pass", outcome: "success", recordedAt: `2026-01-01T00:01:0${index}.000Z`, source: "automatic", runId: `feedback-agentmon-${index}` },
  ]).flat();
  await writeFile(agentmonPath, `${JSON.stringify(agentmon, null, 2)}\n`);
  const answerSentinel = "PROVIDER-ANSWER-MUST-NOT-PERSIST-4402";
  const promptSentinel = "PROVIDER-PROMPT-MUST-NOT-PERSIST-7719";
  const model = createServer(async (request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "feedback-model" }] }));
      return;
    }
    for await (const _chunk of request) {}
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: answerSentinel } }] }));
  });
  await new Promise((resolvePromise) => model.listen(0, "127.0.0.1", resolvePromise));
  const baseUrl = `http://127.0.0.1:${model.address().port}/v1`;
  const server = await startDesktopBrowserServer({ rootDir, engineRoot: projectRoot, port: 0 });
  const endpoint = `http://127.0.0.1:${server.port}`;
  const headers = { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" };
  try {
    const connection = await (await fetch(`${endpoint}/v1/desktop/model-provider/connect`, { method: "POST", headers, body: JSON.stringify({ provider: "local", baseUrl, model: "feedback-model" }) })).json();
    assert.equal(connection.connected, true);
    const chat = await (await fetch(`${endpoint}/v1/desktop/model-provider/chat`, { method: "POST", headers, body: JSON.stringify({ provider: "local", slot: "main", conversation: "feedback-test", prompt: `Implement the next product milestone and verify ${promptSentinel}.` }) })).json();
    assert.equal(chat.answer, answerSentinel);
    assert.equal(chat.feedback.eligible, true);
    assert.ok(chat.feedback.token);
    const outcomeResponse = await fetch(`${endpoint}/v1/desktop/model-provider/outcome`, { method: "POST", headers, body: JSON.stringify({ token: chat.feedback.token, feedback: "helped" }) });
    assert.equal(outcomeResponse.status, 200);
    const outcome = await outcomeResponse.json();
    assert.equal(outcome.recorded, true);
    assert.equal(outcome.totalOutcomes > 0, true);
    const duplicate = await fetch(`${endpoint}/v1/desktop/model-provider/outcome`, { method: "POST", headers, body: JSON.stringify({ token: chat.feedback.token, feedback: "missed" }) });
    assert.equal(duplicate.status, 400);
    const artifacts = Buffer.concat(await artifactBytes(join(rootDir, ".agentmon"))).toString("utf8");
    assert.doesNotMatch(artifacts, new RegExp(promptSentinel));
    assert.doesNotMatch(artifacts, new RegExp(answerSentinel));
    const state = JSON.parse(await readFile(join(rootDir, ".agentmon/roster/main/agentmon.json"), "utf8"));
    const event = state.outcomeEvents.at(-1);
    assert.equal(event.provider, "local");
    assert.equal(event.rating, "helped");
    assert.equal(event.rawTextStored, false);
    assert.equal(event.proofEligible, false);
    assert.doesNotMatch(JSON.stringify(event), /prompt|response|answer/i);
  } finally {
    await server.close();
    await new Promise((resolvePromise) => model.close(resolvePromise));
    await rm(rootDir, { recursive: true, force: true });
  }
});
