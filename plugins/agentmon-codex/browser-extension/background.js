const COMPANION = "http://127.0.0.1:4765";
const PAIR_TOKEN_KEY = "agentmonBrowserPairToken";

async function readPairToken() {
  const stored = await chrome.storage.local.get(PAIR_TOKEN_KEY);
  return stored[PAIR_TOKEN_KEY] || null;
}

async function companionRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.auth !== false) {
    const token = await readPairToken();
    if (!token) throw new Error("Pair the extension with the local companion first.");
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${COMPANION}${path}`, { method: options.method || "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined, cache: "no-store" });
  const payload = await response.json().catch(() => ({ error: "Invalid local companion response." }));
  if (!response.ok) throw new Error(payload.error || `Local companion returned ${response.status}.`);
  return payload;
}

async function pair(code) {
  const payload = await companionRequest("/v1/browser/pair", { method: "POST", auth: false, body: { code } });
  await chrome.storage.local.set({ [PAIR_TOKEN_KEY]: payload.token });
  return { paired: true, retention: payload.retention, scope: payload.scope };
}

async function siteState(message) {
  return companionRequest("/v1/browser/site-state", {
    method: "POST",
    body: { site: String(message.site || "").trim().toLowerCase(), enabled: message.enabled === true }
  });
}

async function ingest(message, sender) {
  if (!sender.tab?.url) throw new Error("Agentmon accepts prompts only from an enabled browser tab.");
  const tabUrl = new URL(sender.tab.url);
  if (tabUrl.hostname !== message.site) throw new Error("Prompt site did not match the sending tab.");
  const content = String(message.content || "").trim();
  if (!content || content.length > 100_000) throw new Error("Submitted prompt must contain 1-100,000 characters.");
  return companionRequest("/v1/browser/ingest", {
    method: "POST",
    body: {
      slot: "main",
      site: tabUrl.hostname,
      conversation: message.conversation,
      eventId: message.eventId,
      consentedAt: new Date().toISOString(),
      content
    }
  });
}

function checkedTab(message, sender) {
  if (!sender.tab?.url) throw new Error("Agentmon commands are accepted only from an enabled browser tab.");
  const tabUrl = new URL(sender.tab.url);
  if (tabUrl.hostname !== message.site) throw new Error("Agentmon command site did not match the sending tab.");
  return tabUrl;
}

async function activate(message, sender) {
  checkedTab(message, sender);
  return companionRequest("/v1/browser/activate", {
    method: "POST",
    body: {
      action: message.action === "off" ? "off" : "use",
      slot: String(message.slot || "main"),
      conversation: String(message.conversation || "current"),
    },
  });
}

async function downlink(message, sender) {
  checkedTab(message, sender);
  return companionRequest(`/v1/browser/downlink?conversation=${encodeURIComponent(String(message.conversation || "current"))}`);
}

async function route(message, sender) {
  const tabUrl = checkedTab(message, sender);
  const content = String(message.content || "").trim();
  if (!content || content.length > 100_000) throw new Error("Submitted prompt must contain 1-100,000 characters.");
  return companionRequest("/v1/browser/route", {
    method: "POST",
    body: {
      slot: String(message.slot || "main"),
      site: tabUrl.hostname,
      conversation: String(message.conversation || "current"),
      content,
    },
  });
}

async function outcome(message, sender) {
  checkedTab(message, sender);
  return companionRequest("/v1/browser/outcome", {
    method: "POST",
    body: {
      conversation: String(message.conversation || "current"),
      outcome: message.outcome,
      rating: message.rating,
      retryCount: 0,
      correctionLevel: message.rating === "missed" ? "replaced" : "none",
    },
  });
}

async function actionMode(message, sender) {
  const tabUrl = checkedTab(message, sender);
  return companionRequest("/v1/browser/actions/mode", {
    method: "POST",
    body: { slot: "main", site: tabUrl.hostname, enabled: message.enabled === true },
  });
}

async function actionStatus(message) {
  const site = String(message.site || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(site)) throw new Error("Invalid Action Learning site.");
  return companionRequest(`/v1/browser/actions/status?slot=main&site=${encodeURIComponent(site)}`);
}

async function actionEvent(message, sender) {
  const tabUrl = checkedTab(message, sender);
  return companionRequest("/v1/browser/actions/event", {
    method: "POST",
    body: { slot: "main", site: tabUrl.hostname, event: message.event },
  });
}

async function actionEmotion(message) {
  return companionRequest("/v1/browser/actions/emotion", {
    method: "POST",
    body: {
      slot: "main",
      site: String(message.site || ""),
      state: String(message.state || "neutral"),
      intensity: Number(message.intensity) || 1,
    },
  });
}

async function actionReview(message) {
  return companionRequest("/v1/browser/actions/review", {
    method: "POST",
    body: { slot: "main", site: String(message.site || ""), actionSkillId: String(message.actionSkillId || ""), review: message.review },
  });
}

async function actionSimulate(message) {
  return companionRequest("/v1/browser/actions/simulate", {
    method: "POST",
    body: { slot: "main", site: String(message.site || ""), actionSkillId: String(message.actionSkillId || "") },
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const task = message?.type === "AGENTMON_PAIR" ? pair(String(message.code || "").trim())
    : message?.type === "AGENTMON_STATUS" ? companionRequest("/v1/browser/status")
      : message?.type === "AGENTMON_OPEN_HOME" ? companionRequest("/v1/browser/open-home", { method: "POST", body: {} })
      : message?.type === "AGENTMON_SITE_STATE" ? siteState(message)
      : message?.type === "AGENTMON_PROMPT_SUBMITTED" ? ingest(message, sender)
        : message?.type === "AGENTMON_ACTIVATE" ? activate(message, sender)
          : message?.type === "AGENTMON_DOWNLINK" ? downlink(message, sender)
            : message?.type === "AGENTMON_ROUTE" ? route(message, sender)
            : message?.type === "AGENTMON_OUTCOME" ? outcome(message, sender)
              : message?.type === "AGENTMON_ACTION_MODE" ? actionMode(message, sender)
                : message?.type === "AGENTMON_ACTION_STATUS" ? actionStatus(message)
                  : message?.type === "AGENTMON_ACTION_EVENT" ? actionEvent(message, sender)
                    : message?.type === "AGENTMON_ACTION_EMOTION" ? actionEmotion(message)
                      : message?.type === "AGENTMON_ACTION_REVIEW" ? actionReview(message)
                        : message?.type === "AGENTMON_ACTION_SIMULATE" ? actionSimulate(message)
        : Promise.reject(new Error("Unknown Agentmon extension message."));
  task.then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
