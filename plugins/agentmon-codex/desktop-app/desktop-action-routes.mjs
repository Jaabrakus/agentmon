import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function loadActions(engineRoot) {
  return import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/runtime/action-learning-service.mjs")).href);
}

function requireEnabledSite(grant, value) {
  const site = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(site)) throw new Error("Invalid site hostname.");
  if (grant.sites.get(site)?.enabled !== true) throw new Error("This site is not enabled for Agentmon.");
  return site;
}

function requireActionLearningSite(grant, value) {
  const site = requireEnabledSite(grant, value);
  if (grant.sites.get(site)?.actionLearningEnabled !== true) throw new Error("Action Learning is not enabled for this site.");
  return site;
}

export async function routeDesktopActionRequest(context) {
  const { request, response, url, origin, grant, rootDir, engineRoot, safeSlot, readJson, sendJson } = context;
  if (!url.pathname.startsWith("/v1/browser/actions/")) return false;
  const input = request.method === "POST" ? await readJson(request) : null;
  const actions = await loadActions(engineRoot);
  if (request.method === "POST" && url.pathname === "/v1/browser/actions/mode") {
    const site = requireEnabledSite(grant, input.site);
    const existing = grant.sites.get(site);
    const enabled = input.enabled === true;
    grant.sites.set(site, { ...existing, site, enabled: true, actionLearningEnabled: enabled, updatedAt: new Date().toISOString() });
    grant.site = site;
    grant.lastSeenAt = new Date().toISOString();
    const status = await actions.readActionLearningStatus({ rootDir, slot: safeSlot(input.slot) });
    sendJson(response, 200, { format: "agentmon.browser-action-mode/v1", site, enabled, status, privacy: { rawTextStored: false, fieldValuesStored: false, screenshotsStored: false, keystrokesStored: false, localOnly: true } }, origin);
    return true;
  }
  if (request.method === "GET" && url.pathname === "/v1/browser/actions/status") {
    const site = requireEnabledSite(grant, url.searchParams.get("site"));
    const status = await actions.readActionLearningStatus({ rootDir, slot: safeSlot(url.searchParams.get("slot")) });
    sendJson(response, 200, { format: "agentmon.browser-action-status/v1", site, enabled: grant.sites.get(site)?.actionLearningEnabled === true, status }, origin);
    return true;
  }
  const site = requireActionLearningSite(grant, input?.site);
  const slot = safeSlot(input?.slot);
  if (request.method === "POST" && url.pathname === "/v1/browser/actions/event") {
    const result = await actions.recordActionEvent({ rootDir, slot, input: { ...input.event, site } });
    sendJson(response, 200, { format: "agentmon.browser-action-event/v1", ...result, privacy: { rawTextStored: false, fieldValuesStored: false, screenshotsStored: false, keystrokesStored: false, localOnly: true } }, origin);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/v1/browser/actions/emotion") {
    const result = await actions.declareActionEmotion({ rootDir, slot, input: { state: input.state, intensity: input.intensity } });
    sendJson(response, 200, { format: "agentmon.browser-action-emotion/v1", site, ...result, policy: "Trainer-declared temporary state; never inferred or treated as permission." }, origin);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/v1/browser/actions/review") {
    const result = await actions.reviewActionProposal({ rootDir, slot, actionSkillId: String(input.actionSkillId || ""), review: input.review });
    sendJson(response, 200, { format: "agentmon.browser-action-review/v1", site, ...result }, origin);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/v1/browser/actions/simulate") {
    const simulation = await actions.simulateActionProposal({ rootDir, slot, actionSkillId: String(input.actionSkillId || ""), grantedSites: [site] });
    sendJson(response, 200, { format: "agentmon.browser-action-simulation/v1", simulation }, origin);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/v1/browser/actions/outcome") {
    const result = await actions.recordActionOutcome({ rootDir, slot, input });
    sendJson(response, 200, { format: "agentmon.browser-action-outcome/v1", ...result }, origin);
    return true;
  }
  return false;
}
