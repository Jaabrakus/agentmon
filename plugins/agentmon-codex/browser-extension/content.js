(() => {
  if (globalThis.__agentmonSubmitCaptureInstalled) return;
  globalThis.__agentmonSubmitCaptureInstalled = true;

  const SUPPORTED = new Set(["chatgpt.com", "claude.ai", "gemini.google.com", "kimi.com", "www.kimi.com", "venice.ai", "github.com", "linear.app", "notion.so", "www.notion.so"]);
  const PROMPT_SITES = new Set(["chatgpt.com", "claude.ai", "gemini.google.com", "kimi.com", "www.kimi.com", "venice.ai"]);
  if (!SUPPORTED.has(location.hostname)) return;
  const promptSite = PROMPT_SITES.has(location.hostname);

  let lastDigest = "";
  let lastSentAt = 0;
  let activeDownlink = null;
  let autoSlot = null;
  let routePending = false;
  let conversationId = "";
  let actionLearningEnabled = false;
  const actionSession = crypto.randomUUID();
  let lastActionKey = "";
  let lastActionAt = 0;

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function isPromptField(element) {
    return element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && (element.isContentEditable || element.getAttribute("role") === "textbox"));
  }

  function promptText(element) {
    if (element instanceof HTMLTextAreaElement) return element.value;
    return element instanceof HTMLElement ? element.innerText || element.textContent || "" : "";
  }

  function setPromptText(element, value) {
    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(element, value);
    } else if (element instanceof HTMLElement) {
      element.textContent = value;
    }
    element?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  function notice(text, error = false) {
    const previous = document.querySelector("#agentmon-local-notice");
    previous?.remove();
    const element = document.createElement("div");
    element.id = "agentmon-local-notice";
    element.textContent = text;
    Object.assign(element.style, { position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483647", maxWidth: "360px", padding: "12px 14px", border: `2px solid ${error ? "#ff8294" : "#5ae0bc"}`, background: "#0d1020", color: error ? "#ffb3bd" : "#bdf7d8", font: "700 12px ui-monospace, monospace", boxShadow: "0 8px 30px #0008" });
    document.documentElement.append(element);
    setTimeout(() => element.remove(), 4_000);
  }

  function receiptButton(label, color) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, {
      flex: "1",
      border: `1px solid ${color}`,
      background: `${color}18`,
      color,
      padding: "8px 10px",
      font: "800 11px ui-monospace, monospace",
      cursor: "pointer",
    });
    return button;
  }

  function showAppliedReceipt(downlink, conversation) {
    document.querySelector("#agentmon-local-receipt")?.remove();
    const procedures = Array.isArray(downlink?.procedures) ? downlink.procedures : [];
    if (!downlink) return;

    const receipt = document.createElement("aside");
    receipt.id = "agentmon-local-receipt";
    receipt.setAttribute("aria-live", "polite");
    Object.assign(receipt.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483646",
      width: "min(360px, calc(100vw - 40px))",
      padding: "14px",
      border: "2px solid #5ae0bc",
      background: "#0d1020",
      color: "#e9f4dc",
      font: "12px ui-monospace, monospace",
      boxShadow: "0 12px 36px #000a",
    });

    const heading = document.createElement("strong");
    heading.textContent = `${String(downlink.agentmon?.name || "AGENTMON").toUpperCase()} APPLIED`;
    Object.assign(heading.style, { display: "block", color: "#5ae0bc", letterSpacing: "1px", marginBottom: "7px" });
    const proof = document.createElement("div");
    proof.textContent = procedures.length
      ? `Complete identity + ${procedures.length} arena-proven skill${procedures.length === 1 ? "" : "s"} matched this prompt`
      : "Complete identity active · skill router stayed out (no proven match)";
    Object.assign(proof.style, { color: "#bdf7d8", fontWeight: "700", marginBottom: "7px" });
    const skillList = document.createElement("div");
    const identity = downlink.identity || {};
    const identityLine = `${identity.permanentArchetype || "Identity"} · ${identity.resonance?.mode || "unbound"} resonance`;
    skillList.textContent = [`◆ ${identityLine}`, ...procedures.map((procedure) => `✓ ${procedure.name || procedure.id}`)].join("\n");
    Object.assign(skillList.style, { color: "#9ca8d3", whiteSpace: "pre-line", lineHeight: "1.45", marginBottom: "10px" });
    const question = document.createElement("div");
    question.textContent = procedures.length ? "After you read the answer: did Agentmon help?" : "Identity lens applied. A proven procedure was not claimed.";
    Object.assign(question.style, { color: "#ffd269", fontWeight: "800", marginBottom: "8px" });
    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "8px" });
    const helped = receiptButton("HELPED", "#5ae0bc");
    const missed = receiptButton("MISSED", "#ff8294");
    actions.append(helped, missed);
    const privacy = document.createElement("div");
    privacy.textContent = "Feedback is derived-only. Agentmon never reads the response.";
    Object.assign(privacy.style, { color: "#707ba0", fontSize: "9px", marginTop: "9px", lineHeight: "1.35" });
    if (procedures.length) receipt.append(heading, proof, skillList, question, actions, privacy);
    else receipt.append(heading, proof, skillList, question, privacy);
    document.documentElement.append(receipt);

    async function record(helpedOutcome) {
      helped.disabled = true;
      missed.disabled = true;
      question.textContent = "Recording locally…";
      const response = await chrome.runtime.sendMessage({
        type: "AGENTMON_OUTCOME",
        conversation,
        site: location.hostname,
        rating: helpedOutcome ? "helped" : "missed",
        outcome: helpedOutcome ? "success" : "failure",
      }).catch((error) => ({ ok: false, error: error.message }));
      if (!response?.ok) {
        question.textContent = response?.error || "Feedback could not be recorded.";
        question.style.color = "#ff8294";
        helped.disabled = false;
        missed.disabled = false;
        return;
      }
      const result = response.result || {};
      heading.textContent = helpedOutcome ? "WIN RECORDED LOCALLY" : "MISS RECORDED LOCALLY";
      heading.style.color = helpedOutcome ? "#5ae0bc" : "#ff8294";
      question.textContent = `Usefulness ${Number(result.score) || 0} · ${Number(result.totalOutcomes) || 0} measured outcome${Number(result.totalOutcomes) === 1 ? "" : "s"}`;
      question.style.color = "#bdf7d8";
      actions.remove();
      privacy.textContent = helpedOutcome ? "This evidence strengthens useful procedures." : "This procedure will be re-evaluated before future use.";
      setTimeout(() => receipt.remove(), 8_000);
    }

    helped.addEventListener("click", () => { void record(true); });
    missed.addEventListener("click", () => { void record(false); });
  }

  function findPromptField(context) {
    const active = document.activeElement;
    if (isPromptField(active) && isVisible(active)) return active;
    const root = context instanceof Element ? context.closest("form") || document : document;
    const candidates = [...root.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter(isPromptField).filter(isVisible);
    return candidates.sort((left, right) => promptText(right).trim().length - promptText(left).trim().length)[0] || null;
  }

  function isSendButton(target) {
    const button = target instanceof Element ? target.closest("button, [role=button]") : null;
    if (!button || button.hasAttribute("disabled")) return false;
    const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.getAttribute("data-testid"), button.textContent].filter(Boolean).join(" ");
    return button.getAttribute("type") === "submit" || /(?:send|submit|ask|prompt|发送|送信)/i.test(label);
  }

  async function digest(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function pageClass() {
    const path = location.pathname.toLowerCase();
    const classes = [
      ["settings", /(?:^|\/)(?:settings|preferences|configuration)(?:\/|$)/],
      ["project", /(?:^|\/)(?:project|projects|repo|repository|workspace)(?:\/|$)/],
      ["document", /(?:^|\/)(?:doc|docs|document|page|wiki)(?:\/|$)/],
      ["issue", /(?:^|\/)(?:issue|issues|ticket|tickets)(?:\/|$)/],
      ["inbox", /(?:^|\/)(?:inbox|messages|notifications)(?:\/|$)/],
      ["compose", /(?:^|\/)(?:compose|new|create)(?:\/|$)/],
      ["search", /(?:^|\/)(?:search|find)(?:\/|$)/],
      ["profile", /(?:^|\/)(?:profile|account)(?:\/|$)/],
      ["checkout", /(?:^|\/)(?:checkout|payment|billing)(?:\/|$)/],
    ];
    return classes.find(([, pattern]) => pattern.test(path))?.[0] || (document.querySelector("form") ? "form" : "unknown");
  }

  function controlClass(target, kind) {
    if (kind === "form-submit") return "submit";
    const control = target instanceof Element ? target.closest("button, a, [role=button], [role=menuitem]") : null;
    if (!control) return "unknown";
    const hint = [control.getAttribute("aria-label"), control.getAttribute("title"), control.getAttribute("data-testid"), control.textContent]
      .filter(Boolean).join(" ").toLowerCase().slice(0, 240);
    const taxonomy = [
      ["delete", /\b(delete|remove|trash)\b/], ["approve", /\b(approve|accept|confirm)\b/],
      ["reject", /\b(reject|decline)\b/], ["send", /\b(send|publish|post)\b/],
      ["share", /\bshare\b/], ["upload", /\bupload\b/], ["download", /\bdownload\b/],
      ["create", /\b(create|new|add)\b/], ["edit", /\b(edit|modify)\b/], ["save", /\b(save|update)\b/],
      ["search", /\b(search|find)\b/], ["filter", /\bfilter\b/], ["sort", /\bsort\b/],
      ["copy", /\bcopy\b/], ["cancel", /\b(cancel|close|dismiss)\b/], ["continue", /\b(continue|next|proceed)\b/],
      ["back", /\b(back|previous)\b/], ["menu", /\b(menu|more|options)\b/],
    ];
    return taxonomy.find(([, pattern]) => pattern.test(hint))?.[0] || (control instanceof HTMLAnchorElement ? "open" : "unknown");
  }

  function sensitiveActionTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest("#agentmon-local-notice, #agentmon-local-receipt")) return true;
    return Boolean(target.closest('input[type="password"], input[autocomplete="one-time-code"], input[autocomplete^="cc-"], [data-agentmon-private]'));
  }

  async function recordSemanticAction(kind, target = document.documentElement) {
    if (!actionLearningEnabled || sensitiveActionTarget(target)) return;
    const control = kind === "navigation" ? "open" : controlClass(target, kind);
    const currentPageClass = pageClass();
    const actionKey = `${currentPageClass}:${kind}:${control}`;
    const now = Date.now();
    if (actionKey === lastActionKey && now - lastActionAt < 750) return;
    lastActionKey = actionKey;
    lastActionAt = now;
    const routeDigest = await digest(`${location.hostname}:${location.pathname}`);
    chrome.runtime.sendMessage({
      type: "AGENTMON_ACTION_EVENT",
      site: location.hostname,
      event: {
        format: "agentmon.action-event/v1",
        id: `browser-${crypto.randomUUID()}`,
        session: actionSession,
        routeDigest,
        pageClass: currentPageClass,
        kind,
        control,
        observedAt: new Date().toISOString(),
      },
    }).catch(() => {});
  }

  async function setActionLearning(enabled) {
    const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ACTION_MODE", site: location.hostname, enabled });
    if (!response?.ok) throw new Error(response?.error || "Could not change Action Learning mode.");
    actionLearningEnabled = response.result?.enabled === true;
    if (actionLearningEnabled) await recordSemanticAction("navigation");
    notice(actionLearningEnabled ? "Action Learning on: semantic events only, no text or field values." : "Action Learning off.");
    return { enabled: actionLearningEnabled, status: response.result?.status || null };
  }

  async function actionLearningState() {
    const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ACTION_STATUS", site: location.hostname }).catch(() => null);
    if (response?.ok) actionLearningEnabled = response.result?.enabled === true;
    return { enabled: actionLearningEnabled, status: response?.result?.status || null };
  }

  function originalPrompt(value) {
    const divider = "[/AGENTMON DOWNLINK]\n\nUSER REQUEST:\n";
    return value.startsWith("[AGENTMON DOWNLINK") && value.includes(divider) ? value.slice(value.indexOf(divider) + divider.length).trim() : value;
  }

  function resumeSubmission(field, context) {
    const form = field?.closest?.("form");
    if (form?.requestSubmit) { form.requestSubmit(); return true; }
    const originalButton = context instanceof Element ? context.closest("button, [role=button]") : null;
    if (originalButton && isSendButton(originalButton)) { originalButton.click(); return true; }
    const button = [...document.querySelectorAll("button, [role=button]")].find((candidate) => isVisible(candidate) && isSendButton(candidate));
    if (button) { button.click(); return true; }
    return false;
  }

  function modeState() {
    return {
      enabled: Boolean(autoSlot),
      slot: autoSlot || "main",
      agentmon: activeDownlink?.agentmon?.name || null,
      procedureIds: activeDownlink?.procedures?.map((procedure) => procedure.id) || [],
    };
  }

  async function setAutoMode(enabled, slot = "main") {
    if (enabled && !promptSite) throw new Error("Agentmon Prompt Mode is available only on approved LLM sites. Use Action Learning here.");
    if (!conversationId) conversationId = (await digest(`${location.hostname}${location.pathname}`)).slice(0, 24);
    const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ACTIVATE", action: "off", slot: "main", site: location.hostname, conversation: conversationId });
    if (!response?.ok) throw new Error(response?.error || "Could not change Agentmon Mode.");
    activeDownlink = null;
    autoSlot = enabled ? slot : null;
    notice(enabled ? `${slot} Agentmon Mode enabled for this tab.` : "Agentmon Mode disabled for this tab.");
    return modeState();
  }

  async function captureSubmittedPrompt(context, event) {
    if (!promptSite) return;
    const field = findPromptField(context);
    const displayed = promptText(field).trim();
    if (displayed.startsWith("[AGENTMON DOWNLINK")) return;
    let content = originalPrompt(displayed);
    if (!content) return;
    const command = content.match(/^\/agentmon\s+(?:use\s+([a-z0-9][a-z0-9-]{0,39})|(auto)(?:\s+([a-z0-9][a-z0-9-]{0,39}|off))?|(off)|(helped)|(missed))\s*$/i);
    if (command) {
      event?.preventDefault();
      event?.stopImmediatePropagation();
      setPromptText(field, "");
      if (!conversationId) conversationId = (await digest(`${location.hostname}${location.pathname}`)).slice(0, 24);
      if (command[5] || command[6]) {
        const helped = Boolean(command[5]);
        const response = await chrome.runtime.sendMessage({ type: "AGENTMON_OUTCOME", conversation: conversationId, site: location.hostname, rating: helped ? "helped" : "missed", outcome: helped ? "success" : "failure" }).catch((error) => ({ ok: false, error: error.message }));
        if (!response?.ok) return notice(response?.error || "Agentmon feedback failed.", true);
        notice(helped ? "Outcome recorded locally: Agentmon helped." : "Outcome recorded locally: Agentmon missed. Its procedure will be re-evaluated.");
        return;
      }
      if (command[2]) {
        await setAutoMode(command[3]?.toLowerCase() !== "off", command[3] || "main").catch((error) => notice(error.message, true));
        return;
      }
      const action = command[1] ? "use" : "off";
      const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ACTIVATE", action, slot: command[1] || "main", site: location.hostname, conversation: conversationId }).catch((error) => ({ ok: false, error: error.message }));
      if (!response?.ok) return notice(response?.error || "Agentmon activation failed.", true);
      activeDownlink = action === "use" ? response.result : null;
      autoSlot = null;
      notice(action === "use" ? `${activeDownlink.agentmon?.name || command[1]} activated locally. Future submitted prompts receive its approved skill packet.` : "Agentmon downlink disabled for this chat.");
      return;
    }
    if (autoSlot) {
      event?.preventDefault();
      event?.stopImmediatePropagation();
      if (routePending) return;
      routePending = true;
      if (!conversationId) conversationId = (await digest(`${location.hostname}${location.pathname}`)).slice(0, 24);
      const response = await chrome.runtime.sendMessage({ type: "AGENTMON_ROUTE", slot: autoSlot, site: location.hostname, conversation: conversationId, content }).catch((error) => ({ ok: false, error: error.message }));
      routePending = false;
      if (!response?.ok) return notice(response?.error || "Agentmon auto-routing failed; prompt was not sent.", true);
      activeDownlink = response.result?.active ? response.result.downlink : null;
      if (activeDownlink?.packet) setPromptText(field, `${activeDownlink.packet}\n\nUSER REQUEST:\n${content}`);
      const fingerprint = await digest(content);
      lastDigest = fingerprint;
      lastSentAt = Date.now();
      chrome.runtime.sendMessage({ type: "AGENTMON_PROMPT_SUBMITTED", site: location.hostname, conversation: conversationId, eventId: crypto.randomUUID(), content }).catch(() => {});
      content = "";
      showAppliedReceipt(activeDownlink, conversationId);
      if (!resumeSubmission(field, context)) return notice("Agentmon prepared the prompt. Press Send once more.");
      notice(activeDownlink ? `${activeDownlink.agentmon?.name || autoSlot} identity active · ${activeDownlink.procedures.length} proven procedure(s).` : "Agentmon identity could not be loaded; sending without a packet.");
      return;
    }
    if (activeDownlink?.packet && !promptText(field).trim().startsWith("[AGENTMON DOWNLINK")) {
      setPromptText(field, `${activeDownlink.packet}\n\nUSER REQUEST:\n${content}`);
    }
    const fingerprint = await digest(content);
    const now = Date.now();
    if (fingerprint === lastDigest && now - lastSentAt < 3_000) { content = ""; return; }
    lastDigest = fingerprint;
    lastSentAt = now;
    if (!conversationId) conversationId = (await digest(`${location.hostname}${location.pathname}`)).slice(0, 24);
    showAppliedReceipt(activeDownlink, conversationId);
    const message = { type: "AGENTMON_PROMPT_SUBMITTED", site: location.hostname, conversation: conversationId, eventId: crypto.randomUUID(), content };
    content = "";
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  document.addEventListener("submit", (event) => { void recordSemanticAction("form-submit", event.target); void captureSubmittedPrompt(event.target, event); }, true);
  document.addEventListener("click", (event) => { void recordSemanticAction("control", event.target); if (isSendButton(event.target)) void captureSubmittedPrompt(event.target, event); }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing && isPromptField(event.target)) void captureSubmittedPrompt(event.target, event);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "AGENTMON_AUTO_MODE") {
      if (message.action === "status") sendResponse({ ok: true, mode: modeState() });
      else setAutoMode(message.enabled === true, String(message.slot || "main"))
        .then((mode) => sendResponse({ ok: true, mode }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "AGENTMON_ACTION_LEARNING") {
      const operation = message.action === "status" ? actionLearningState() : setActionLearning(message.enabled === true);
      operation.then((state) => sendResponse({ ok: true, state })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });

  if (promptSite) {
    void digest(`${location.hostname}${location.pathname}`).then((value) => {
      conversationId = value.slice(0, 24);
      return chrome.runtime.sendMessage({ type: "AGENTMON_DOWNLINK", site: location.hostname, conversation: conversationId });
    }).then((response) => {
      if (response?.ok && response.result?.active && response.result.downlink?.format === "agentmon.downlink/v1") activeDownlink = response.result.downlink;
    }).catch(() => {});
  }
  void actionLearningState().catch(() => {});
})();
