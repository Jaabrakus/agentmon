const SUPPORTED = new Set(["chatgpt.com", "claude.ai", "gemini.google.com", "kimi.com", "www.kimi.com", "venice.ai", "github.com", "linear.app", "notion.so", "www.notion.so"]);
const PROMPT_SITES = new Set(["chatgpt.com", "claude.ai", "gemini.google.com", "kimi.com", "www.kimi.com", "venice.ai"]);
const pairButton = document.querySelector("#pair");
const codeInput = document.querySelector("#pair-code");
const toggleButton = document.querySelector("#toggle");
const siteLabel = document.querySelector("#site");
const statusLabel = document.querySelector("#status");
const connection = document.querySelector("#connection");
const marketplacePanel = document.querySelector("#marketplace-panel");
const marketplaceState = document.querySelector("#marketplace-state");
const marketplaceDetail = document.querySelector("#marketplace-detail");
const openHomeButton = document.querySelector("#open-home");
const journey = document.querySelector("#journey");
const journeyStep = document.querySelector("#journey-step");
const journeyTitle = document.querySelector("#journey-title");
const journeyDetail = document.querySelector("#journey-detail");
const incubation = document.querySelector("#incubation");
const agentmonName = document.querySelector("#agentmon-name");
const agentmonStage = document.querySelector("#agentmon-stage");
const agentmonMeter = document.querySelector("#agentmon-meter");
const pairedDetails = document.querySelector("#paired-details");
const pairingPanel = document.querySelector("#pairing-panel");
const agentmonForm = document.querySelector("#agentmon-form");
const agentmonSkills = document.querySelector("#agentmon-skills");
const agentmonProofs = document.querySelector("#agentmon-proofs");
const evolutionNote = document.querySelector("#evolution-note");
const modePanel = document.querySelector("#mode-panel");
const modeButton = document.querySelector("#mode-toggle");
const modeState = document.querySelector("#mode-state");
const modeDetail = document.querySelector("#mode-detail");
const modeSkill = document.querySelector("#mode-skill");
const actionPanel = document.querySelector("#action-panel");
const actionState = document.querySelector("#action-state");
const actionButton = document.querySelector("#action-toggle");
const actionDetail = document.querySelector("#action-detail");
const actionResonance = document.querySelector("#action-resonance");
const actionEvents = document.querySelector("#action-events");
const actionProposals = document.querySelector("#action-proposals");
const actionProposal = document.querySelector("#action-proposal");
const actionProposalName = document.querySelector("#action-proposal-name");
const actionProposalForecast = document.querySelector("#action-proposal-forecast");
const actionSimulate = document.querySelector("#action-simulate");
const actionApprove = document.querySelector("#action-approve");
const emotionState = document.querySelector("#emotion-state");
const emotionIntensity = document.querySelector("#emotion-intensity");
const emotionSet = document.querySelector("#emotion-set");
const emotionPolicy = document.querySelector("#emotion-policy");
let currentTab;
let currentOrigin;
let enabled = false;
let paired = false;
let modeEnabled = false;
let activeAgentmonName = "Agentmon";
let agentmonStageValue = "signal";
let agentmonReadinessValue = 0;
let agentmonOutcomesValue = 0;
let agentmonUsefulnessValue = 0;
let actionLearningEnabled = false;
let currentActionSkill = null;

function status(text, error = false) { statusLabel.textContent = text; statusLabel.style.color = error ? "#ff8294" : "#ffd269"; }
function showJourney() {
  let step = 1;
  let title = "PAIR AGENTMON";
  let detail = "Turn on the desktop companion and enter its one-time code below.";
  let complete = false;
  const hostname = currentTab?.url ? new URL(currentTab.url).hostname : "";
  const actionOnly = Boolean(hostname && !PROMPT_SITES.has(hostname));
  if (paired && !enabled) {
    step = 2;
    title = "ENABLE THIS LLM SITE";
    detail = "Click Enable this site. Access is granted only to this hostname.";
  } else if (paired && enabled && actionOnly && !actionLearningEnabled) {
    step = 3;
    title = "ENABLE ACTION LEARNING";
    detail = "Choose a temporary battle state, then enable semantic Action Learning.";
  } else if (paired && enabled && actionOnly) {
    step = 5;
    title = "ACTION AGENTMON LIVE";
    detail = "Semantic actions are training local, inspectable workflow proposals.";
    complete = true;
  } else if (paired && enabled && agentmonStageValue !== "hatched") {
    step = 3;
    title = agentmonStageValue === "egg" ? "TRAIN THE EGG" : "GROW THE SIGNAL";
    detail = `Keep prompting normally. Hatch readiness is ${agentmonReadinessValue}%.`;
  } else if (paired && enabled && !modeEnabled) {
    step = 4;
    title = "ACTIVATE AGENTMON MODE";
    detail = "Turn Agentmon Mode on below so proven skills can route into this tab.";
  } else if (paired && enabled && modeEnabled && agentmonOutcomesValue === 0) {
    step = 5;
    title = "GET THE FIRST MEASURED WIN";
    detail = "Send a real prompt. The applied-skill receipt will let you mark Helped or Missed.";
  } else if (paired && enabled && modeEnabled) {
    step = 5;
    title = "IMPROVEMENT LOOP LIVE";
    detail = `${agentmonOutcomesValue} measured outcome${agentmonOutcomesValue === 1 ? "" : "s"} · usefulness ${agentmonUsefulnessValue}.`;
    complete = true;
  }
  journeyStep.textContent = complete ? "CORE LOOP COMPLETE" : `STEP ${step} OF 5`;
  journeyTitle.textContent = title;
  journeyDetail.textContent = detail;
  journey.classList.toggle("complete", complete);
}
function showConnection(connected, detail) {
  paired = connected;
  connection.classList.toggle("connected", connected);
  connection.classList.toggle("waiting", !connected);
  connection.querySelector("strong").textContent = connected ? "EXTENSION CONNECTED" : "EXTENSION NOT CONNECTED";
  connection.querySelector("span").textContent = detail;
  pairedDetails.classList.toggle("hidden", !connected);
  pairingPanel.classList.toggle("hidden", connected);
  const hostname = currentTab?.url ? new URL(currentTab.url).hostname : "";
  modePanel.classList.toggle("hidden", !connected || Boolean(hostname && !PROMPT_SITES.has(hostname)));
  actionPanel.classList.toggle("hidden", !connected);
  modeButton.disabled = !(connected && enabled);
  actionButton.disabled = !(connected && enabled && currentTab?.id);
  showJourney();
}
function showAgentmon(agentmon = {}) {
  const stage = ["signal", "egg", "hatched"].includes(agentmon.stage) ? agentmon.stage : "signal";
  const readiness = Math.max(0, Math.min(100, Number(agentmon.readiness) || 0));
  const brightness = Math.max(8, Math.min(100, Number(agentmon.brightness) || readiness || 8));
  incubation.className = `incubation ${stage}-stage`;
  incubation.style.setProperty("--signal", String(brightness / 100));
  agentmonName.textContent = String(agentmon.species?.name || agentmon.name || "UNBOUND SIGNAL").toUpperCase();
  activeAgentmonName = String(agentmon.species?.name || agentmon.name || "Agentmon");
  agentmonStage.textContent = stage === "signal" ? `Signal strength · ${readiness}%` : stage === "egg" ? `Species bound · egg stability ${readiness}%` : `Hatched · readiness ${readiness}%`;
  agentmonMeter.style.width = `${readiness}%`;
  const form = agentmon.evolution?.label || (stage === "hatched" ? "Form II" : "Unbound");
  const stats = agentmon.stats || {};
  agentmonStageValue = stage;
  agentmonReadinessValue = readiness;
  agentmonOutcomesValue = Number(stats.outcomes) || 0;
  agentmonUsefulnessValue = Number(stats.effectivenessScore) || 0;
  agentmonForm.textContent = String(form).toUpperCase();
  agentmonSkills.textContent = String(Number(stats.procedures) || Number(stats.skills) || 0);
  agentmonProofs.textContent = `${Number(stats.arenaProven) || 0}/${Number(stats.arenaTested) || 0}`;
  evolutionNote.textContent = agentmon.evolution?.order >= 3 ? "Final authored form reached." : `Lineage Gen ${Number(stats.lineageGeneration) || 1} · next form requires a permanent DNA event.`;
  showJourney();
}

function showMarketplace(marketplace = {}) {
  marketplacePanel.classList.remove("hidden");
  const verified = marketplace.status === "verified";
  const listed = marketplace.listed === true;
  marketplacePanel.classList.toggle("ready", verified);
  marketplaceState.textContent = listed ? "LISTED" : verified ? "VERIFIED" : marketplace.status === "modded" ? "MODDED" : marketplace.paired ? "UNVERIFIED" : "NOT PAIRED";
  marketplaceDetail.textContent = listed
    ? "Your current verified state is listed. Chrome has no registry credential access."
    : verified
      ? "Verified and eligible to list inside Agentmon Home."
      : marketplace.status === "modded"
        ? "Modified lineage is blocked from the official economy."
        : "Open Agentmon Home to pair, verify, and manage listings.";
}
function scriptId(hostname) { return `agentmon-${hostname.replace(/[^a-z0-9]/gi, "-")}`; }

function showMode(mode = {}) {
  modeEnabled = mode.enabled === true;
  modePanel.classList.toggle("active", modeEnabled);
  modeState.textContent = modeEnabled ? "ON" : "OFF";
  modeButton.textContent = modeEnabled ? "Turn Agentmon Mode Off" : "Turn Agentmon Mode On";
  modeButton.disabled = !(paired && enabled && currentTab?.id);
  modeDetail.textContent = modeEnabled ? `${mode.agentmon || activeAgentmonName} · ${mode.slot || "main"} · this tab only` : enabled ? "Ready for this tab." : "Enable this LLM website first.";
  modeSkill.textContent = mode.procedureIds?.length ? `Last skill: ${mode.procedureIds.join(", ")}` : "Only proven, non-regressed skills can run.";
  showJourney();
}

function showActionLearning(state = {}) {
  actionLearningEnabled = state.enabled === true;
  const summary = state.status || {};
  const skills = Array.isArray(summary.skills) ? summary.skills : [];
  currentActionSkill = skills.find((skill) => skill.status === "proposed") || skills.find((skill) => skill.status === "approved") || null;
  actionPanel.classList.toggle("active", actionLearningEnabled);
  actionState.textContent = actionLearningEnabled ? "ON" : "OFF";
  actionButton.textContent = actionLearningEnabled ? "Turn Action Learning Off" : "Turn Action Learning On";
  actionButton.disabled = !(paired && enabled && currentTab?.id);
  emotionSet.disabled = !(paired && enabled && actionLearningEnabled && currentTab?.id);
  actionResonance.textContent = String(summary.resonance || "—").toUpperCase();
  actionEvents.textContent = String(Number(summary.observedEvents) || 0);
  actionProposals.textContent = String(Number(summary.proposed) || 0);
  const trainerState = summary.trainerState || {};
  if (trainerState.source === "trainer-declared") {
    emotionState.value = trainerState.state || "neutral";
    emotionIntensity.value = String(trainerState.intensity || 1);
    emotionPolicy.textContent = `${String(trainerState.state || "neutral").toUpperCase()} ${trainerState.intensity || 1}/5 · trainer-declared · temporary`;
  } else {
    emotionPolicy.textContent = "You declare it. Agentmon never guesses your feelings.";
  }
  actionDetail.textContent = actionLearningEnabled
    ? "ON · semantic events only · stored locally"
    : "No text, field values, screenshots, or keystrokes.";
  actionProposal.classList.toggle("hidden", !currentActionSkill);
  if (currentActionSkill) {
    const move = currentActionSkill.forecast?.lifeMove?.move || currentActionSkill.forecast?.decision || "check";
    actionProposalName.textContent = currentActionSkill.name.toUpperCase();
    actionProposalForecast.textContent = `${currentActionSkill.confidence}% confidence · ${currentActionSkill.distinctSessions} sessions · Life Move: ${String(move).toUpperCase()}`;
    actionApprove.disabled = currentActionSkill.status !== "proposed";
    actionApprove.textContent = currentActionSkill.status === "approved" ? "Approved" : "Approve";
  }
  showJourney();
}

async function refreshActionLearning() {
  if (!paired || !enabled || !currentTab?.id) { showActionLearning({ enabled: false }); return; }
  const response = await chrome.tabs.sendMessage(currentTab.id, { type: "AGENTMON_ACTION_LEARNING", action: "status" }).catch(() => null);
  showActionLearning(response?.ok ? response.state : { enabled: false });
}

async function refreshMode() {
  if (!paired || !enabled || !currentTab?.id) { showMode({ enabled: false }); return; }
  const response = await chrome.tabs.sendMessage(currentTab.id, { type: "AGENTMON_AUTO_MODE", action: "status" }).catch(() => null);
  showMode(response?.ok ? response.mode : { enabled: false });
}

async function refreshSite() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab?.url) { siteLabel.textContent = "Open a supported website."; showMode({ enabled: false }); showActionLearning({ enabled: false }); return; }
  const url = new URL(currentTab.url);
  if (!SUPPORTED.has(url.hostname)) { siteLabel.textContent = `${url.hostname || "This page"} is not supported.`; showMode({ enabled: false }); showActionLearning({ enabled: false }); return; }
  modePanel.classList.toggle("hidden", !paired || !PROMPT_SITES.has(url.hostname));
  currentOrigin = `${url.origin}/*`;
  enabled = await chrome.permissions.contains({ origins: [currentOrigin] });
  siteLabel.textContent = `${enabled ? "ON" : "OFF"} · ${url.hostname}`;
  toggleButton.textContent = enabled ? "Disable this site" : "Enable this site";
  toggleButton.disabled = false;
  showJourney();
  chrome.runtime.sendMessage({ type: "AGENTMON_SITE_STATE", site: url.hostname, enabled }).then((response) => {
    if (response?.ok) showConnection(true, enabled ? `${url.hostname} · ${PROMPT_SITES.has(url.hostname) ? "prompt access available" : "action access available"}` : "Connected · no site enabled");
  }).catch(() => {});
  await refreshMode();
  await refreshActionLearning();
}

pairButton.addEventListener("click", async () => {
  pairButton.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "AGENTMON_PAIR", code: codeInput.value.trim() }).catch((error) => ({ ok: false, error: error.message }));
  codeInput.value = "";
  pairButton.disabled = false;
  status(response?.ok ? "Paired locally. Raw prompts will use derived-only retention." : response?.error || "Pairing failed.", !response?.ok);
  if (response?.ok) {
    showConnection(true, enabled && currentTab?.url ? `${new URL(currentTab.url).hostname} · site permission on` : "Connected · enable a supported site");
    if (currentTab?.url && SUPPORTED.has(new URL(currentTab.url).hostname)) {
      chrome.runtime.sendMessage({ type: "AGENTMON_SITE_STATE", site: new URL(currentTab.url).hostname, enabled }).catch(() => {});
    }
    chrome.runtime.sendMessage({ type: "AGENTMON_STATUS" }).then((next) => { if (next?.ok) showAgentmon(next.result?.agentmon); }).catch(() => {});
    await refreshMode();
    await refreshActionLearning();
  }
});

openHomeButton.addEventListener("click", async () => {
  openHomeButton.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "AGENTMON_OPEN_HOME" }).catch((error) => ({ ok: false, error: error.message }));
  openHomeButton.disabled = false;
  status(response?.ok ? "Agentmon Home opened. Marketplace controls and credentials stay there." : response?.error || "Could not open Agentmon Home.", !response?.ok);
});

modeButton.addEventListener("click", async () => {
  modeButton.disabled = true;
  const response = await chrome.tabs.sendMessage(currentTab.id, { type: "AGENTMON_AUTO_MODE", action: "set", enabled: !modeEnabled, slot: "main" }).catch((error) => ({ ok: false, error: error.message }));
  if (!response?.ok) status(response?.error || "Could not change Agentmon Mode. Reload this LLM tab and try again.", true);
  else {
    showMode(response.mode);
    status(response.mode.enabled ? `${activeAgentmonName} is now helping in this tab.` : "Agentmon Mode is off for this tab.");
  }
});

emotionSet.addEventListener("click", async () => {
  if (!currentTab?.url || !actionLearningEnabled) return;
  emotionSet.disabled = true;
  const site = new URL(currentTab.url).hostname;
  const response = await chrome.runtime.sendMessage({
    type: "AGENTMON_ACTION_EMOTION",
    site,
    state: emotionState.value,
    intensity: Number(emotionIntensity.value),
  }).catch((error) => ({ ok: false, error: error.message }));
  if (!response?.ok) {
    emotionSet.disabled = false;
    return status(response?.error || "Could not set the battle state.", true);
  }
  showActionLearning({ enabled: actionLearningEnabled, status: response.result?.status });
  status(`${emotionState.value} ${emotionIntensity.value}/5 attached to new semantic actions. Agentmon did not infer it.`);
});

actionButton.addEventListener("click", async () => {
  actionButton.disabled = true;
  const response = await chrome.tabs.sendMessage(currentTab.id, { type: "AGENTMON_ACTION_LEARNING", action: "set", enabled: !actionLearningEnabled }).catch((error) => ({ ok: false, error: error.message }));
  if (!response?.ok) status(response?.error || "Could not change Action Learning. Reload this tab and try again.", true);
  else {
    showActionLearning(response.state);
    status(response.state.enabled ? "Action Learning on. Only semantic events are retained locally." : "Action Learning off for this site.");
  }
});

actionSimulate.addEventListener("click", async () => {
  if (!currentActionSkill || !currentTab?.url) return;
  actionSimulate.disabled = true;
  const site = new URL(currentTab.url).hostname;
  const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ACTION_SIMULATE", site, actionSkillId: currentActionSkill.id }).catch((error) => ({ ok: false, error: error.message }));
  actionSimulate.disabled = false;
  if (!response?.ok) return status(response?.error || "Simulation failed.", true);
  const steps = response.result?.simulation?.steps || [];
  actionProposalForecast.textContent = steps.map((step) => `${step.order}. ${step.control} · ${step.decision}`).join("  |  ") || "Simulation returned no steps.";
  status("Simulation complete. No website action was taken.");
});

actionApprove.addEventListener("click", async () => {
  if (!currentActionSkill || !currentTab?.url) return;
  actionApprove.disabled = true;
  const site = new URL(currentTab.url).hostname;
  const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ACTION_REVIEW", site, actionSkillId: currentActionSkill.id, review: "confirmed" }).catch((error) => ({ ok: false, error: error.message }));
  if (!response?.ok) { actionApprove.disabled = false; return status(response?.error || "Approval failed.", true); }
  showActionLearning({ enabled: actionLearningEnabled, status: response.result?.status });
  status("Action Skill approved locally. Execution remains simulation-only until arena proof exists.");
});

toggleButton.addEventListener("click", async () => {
  toggleButton.disabled = true;
  try {
    const id = scriptId(new URL(currentTab.url).hostname);
    if (enabled) {
      await chrome.tabs.sendMessage(currentTab.id, { type: "AGENTMON_AUTO_MODE", action: "set", enabled: false, slot: "main" }).catch(() => {});
      await chrome.tabs.sendMessage(currentTab.id, { type: "AGENTMON_ACTION_LEARNING", action: "set", enabled: false }).catch(() => {});
      await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
      await chrome.permissions.remove({ origins: [currentOrigin] });
      status("Site disabled. Agentmon cannot read this page.");
    } else {
      const granted = await chrome.permissions.request({ origins: [currentOrigin] });
      if (!granted) throw new Error("Site access was not granted.");
      await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
      await chrome.scripting.registerContentScripts([{ id, matches: [currentOrigin], js: ["content.js"], runAt: "document_start", persistAcrossSessions: true }]);
      await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
      status("Site enabled. Prompt Mode and Action Learning remain separate opt-in controls.");
    }
  } catch (error) { status(error.message, true); }
  await refreshSite();
});

chrome.runtime.sendMessage({ type: "AGENTMON_STATUS" }).then((response) => {
  if (response?.ok) {
    const site = response.result?.site;
    const siteEnabled = response.result?.siteEnabled === true;
    showConnection(true, siteEnabled && site ? `${site} · prompt capture on` : "Connected · no LLM site enabled");
    status("Companion paired · derived-only retention active.");
    showAgentmon(response.result?.agentmon);
    showMarketplace(response.result?.marketplace);
    void refreshMode();
    void refreshActionLearning();
  } else {
    showConnection(false, "Pair with the local Agentmon app.");
  }
}).catch(() => showConnection(false, "Turn Agentmon on, then pair."));
void refreshSite();
