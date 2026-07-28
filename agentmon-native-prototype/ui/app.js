const invoke = window.__TAURI__?.core?.invoke;
let engineState = null;
let lastDownlink = null;
let companionState = null;
let companionRequestInFlight = false;
let companionPollTimer = null;
let localModelConnected = false;
let localModelBusy = false;
let localChatHistory = [];
let localRuntimes = [];
let activeModelProvider = "local";
let localAutoConnectAttempted = false;
let localConfigHydrated = false;
let lifecycleState = null;
let lifecycleBusy = false;
const localConversationId = `desktop-${Date.now().toString(36)}`;

const byId = (id) => document.getElementById(id);
const titleCase = (value = "") => value.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

function proceduralAvatar(dna = "AGENTMON", generation = 1) {
  const seed = [...String(dna)].reduce((value, character, index) => ((value * 33) ^ (character.charCodeAt(0) + index * 17)) >>> 0, 2166136261);
  const hue = seed % 360;
  const accentHue = (hue + 95 + (seed >>> 8) % 120) % 360;
  const cells = [];
  const occupied = new Set();
  for (let y = 2; y < 13; y += 1) {
    for (let x = 2; x < 8; x += 1) {
      const bit = ((seed >>> ((x * 5 + y * 3) % 29)) ^ (x * 13 + y * 7 + generation * 11)) & 3;
      const body = y > 4 && y < 12 && x > 2 && (bit > 0 || (x > 4 && y > 6));
      const crown = y <= 5 && x >= 4 && bit > 1;
      if (!body && !crown) continue;
      occupied.add(`${x}:${y}`);
      occupied.add(`${15 - x}:${y}`);
    }
  }
  for (const key of occupied) {
    const [x, y] = key.split(":").map(Number);
    const accent = (x + y + generation) % 5 === 0 || y < 5;
    cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="hsl(${accent ? accentHue : hue} ${accent ? 82 : 64}% ${accent ? 68 : 48}%)"/>`);
  }
  cells.push('<rect x="5" y="6" width="1" height="1" fill="#eafff7"/><rect x="10" y="6" width="1" height="1" fill="#eafff7"/>');
  if (generation > 1) cells.push(`<rect x="7" y="1" width="2" height="1" fill="hsl(${accentHue} 90% 70%)"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><defs><filter id="g"><feDropShadow dx="0" dy="1" stdDeviation=".55" flood-color="hsl(${hue} 80% 55%)" flood-opacity=".55"/></filter></defs><g filter="url(#g)">${cells.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function setAgentmonAvatar(source, name) {
  document.querySelectorAll(".home-agent img, .details-creature img, .dock-agent img, .mini-agent img, .agent-message .agent-avatar img").forEach((image) => {
    image.src = source;
    image.alt = name;
  });
}

function setView(view) {
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}-view`));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function renderReceipt(downlink) {
  const identity = downlink.identity;
  const procedures = downlink.procedures || [];
  if (!identity) {
    byId("receipt-title").textContent = "Generic local baseline";
    byId("receipt-archetype").textContent = "Not applied";
    byId("receipt-resonance").textContent = "Not applied";
    byId("receipt-skill").textContent = "No Agentmon procedure";
    byId("receipt-delivery").textContent = "Answered locally · generic mode";
    byId("receipt-privacy").textContent = "Raw prompt stored by Agentmon: no · conversation memory: RAM only";
    return;
  }
  byId("receipt-title").textContent = `${identity.name} · ${identity.digest.slice(0, 10)}`;
  byId("receipt-archetype").textContent = titleCase(identity.permanentArchetype);
  byId("receipt-resonance").textContent = `${titleCase(identity.resonance.mode)} · ${identity.resonance.executionMode}`;
  byId("receipt-skill").textContent = procedures.length
    ? procedures.map((item) => item.name).join(", ")
    : downlink.routing?.decision === "identity-only" ? "Identity only · skill router stayed out" : "Identity lens only";
  byId("receipt-delivery").textContent = downlink.delivery?.status === "answered-by-local-model"
    ? `Answered locally · ${downlink.delivery.model}`
    : downlink.delivery?.status === "answered-by-cloud-provider"
      ? `Answered by ${downlink.delivery.provider} · ${downlink.delivery.model}`
    : downlink.delivery?.status === "compiled-not-sent"
      ? "Compiled · not sent"
      : "Identity loaded locally";
  byId("receipt-privacy").textContent = `Raw prompt stored by Agentmon: no · Agentmon cloud: no · selected provider: ${downlink.delivery?.provider || "local"} · conversation memory: RAM only`;
}

function renderTextSource(name, path, content) {
  byId("text-source-viewer").hidden = false;
  byId("image-source-viewer").hidden = true;
  byId("skill-source").textContent = content;
  const lineCount = Math.max(1, content.split("\n").length);
  byId("code-gutter").textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
  byId("source-name").textContent = name;
  byId("source-path").textContent = path;
}

function renderImageSource(result) {
  byId("text-source-viewer").hidden = true;
  byId("image-source-viewer").hidden = false;
  byId("source-image").src = result.dataUrl;
  byId("source-name").textContent = result.name;
  byId("source-path").textContent = result.path;
}

function replaceRows(container, rows) {
  container.replaceChildren(...rows);
}

function renderAgentmonDetails(result) {
  const summary = result.summary;
  const identity = summary.identity;
  const hatch = summary.hatch || {};
  const lineage = summary.lineage || {};
  byId("detail-name").textContent = identity.name;
  byId("detail-species").textContent = `${identity.species} · ${identity.form}`;
  byId("detail-archetype").textContent = titleCase(identity.archetype);
  byId("detail-nature").textContent = titleCase(identity.nature);
  byId("detail-resonance").textContent = titleCase(identity.resonance.mode);
  byId("detail-dna").textContent = lineage.currentDNA || "—";
  byId("detail-generation").textContent = String(lineage.generation || 1);
  byId("detail-engine").textContent = `V${summary.creationVersion}`;
  byId("detail-hatch-score").textContent = `${hatch.score || 0}% ready`;
  byId("detail-hatch-progress").style.width = `${Math.max(0, Math.min(100, hatch.score || 0))}%`;
  byId("detail-evidence").textContent = `${hatch.behavioralPrompts || 0} behavioral prompts · ${hatch.distinctPrompts || 0} total · ${hatch.intentDiversity || 0} intent classes · growth confidence ${summary.promptprint.growth?.confidence || 0}%`;

  replaceRows(byId("detail-patterns"), (result.identity.workingProfile.patterns || []).slice(0, 6).map((pattern) => {
    const row = document.createElement("div");
    row.className = "pattern-chip";
    const label = document.createElement("span");
    label.textContent = pattern.label;
    const score = document.createElement("b");
    score.textContent = `${pattern.score}/96`;
    row.append(label, score);
    return row;
  }));

  byId("detail-capability-count").textContent = String(summary.capabilities.length);
  replaceRows(byId("detail-capabilities"), summary.capabilities.map((capability) => {
    const row = document.createElement("div");
    row.className = "capability-row";
    const name = document.createElement("b");
    name.textContent = capability.name;
    const power = document.createElement("span");
    power.textContent = `${capability.power} PWR`;
    const detail = document.createElement("small");
    detail.textContent = `${capability.type} · ${capability.source} · ${capability.description} · ${capability.evidence} behavioral evidence`;
    row.append(name, power, detail);
    return row;
  }));

  byId("detail-procedure-count").textContent = String(summary.procedures.length);
  const procedures = [...summary.procedures].sort((left, right) => Number(right.arenaStatus === "proven") - Number(left.arenaStatus === "proven") || right.confidence - left.confidence);
  replaceRows(byId("detail-procedures"), procedures.map((procedure) => {
    const row = document.createElement("div");
    row.className = `procedure-row${procedure.arenaStatus === "proven" ? " proven" : ""}`;
    const name = document.createElement("b");
    name.textContent = procedure.name;
    const confidence = document.createElement("span");
    confidence.textContent = `${procedure.confidence}%`;
    const status = document.createElement("small");
    status.textContent = `${procedure.stage} · trainer ${procedure.trainerReview} · arena ${procedure.arenaStatus}`;
    row.append(name, confidence, status);
    return row;
  }));

  byId("detail-arena-tested").textContent = String(summary.arena.tested);
  byId("detail-arena-proven").textContent = String(summary.arena.proven);
  byId("detail-outcomes").textContent = String(summary.effectiveness.totalOutcomes || 0);
  byId("detail-effectiveness").textContent = `${summary.effectiveness.averageScore || 0}/100`;
  const proof = summary.arena.results[0];
  byId("detail-proof-note").textContent = proof
    ? `${proof.procedureId}: ${proof.status} · ${proof.agentmon?.trials || 0} trials · ${proof.agentmon?.passRate || 0}% Agentmon pass rate · ${proof.lift || 0} point lift.`
    : "No arena-tested procedure result yet.";
}

function renderLifecycle(result) {
  lifecycleState = result;
  const stage = result.stage || { key: "signal", label: "UNBOUND SIGNAL" };
  const evidence = result.evidence || {};
  const level = result.level || { level: 0, progress: 0 };
  const evolution = result.evolution || { ready: false, blockers: [] };
  const identity = result.identity;
  const habitatName = String(result.rootDir || "Local Habitat").split(/[\\/]/).filter(Boolean).at(-1) || "Local Habitat";
  byId("project-name").textContent = habitatName;
  const core = byId("lifecycle-core");
  core.dataset.stage = stage.key;
  byId("lifecycle-stage").textContent = stage.label;
  byId("lifecycle-level").textContent = `L${level.level || 0}`;
  byId("lifecycle-level-progress").style.width = `${Math.max(0, Math.min(100, level.progress || 0))}%`;
  byId("lifecycle-name").textContent = identity?.name || "Unbound signal";
  byId("lifecycle-subtitle").textContent = identity
    ? `${identity.archetype} · ${level.current}/${level.next} evidence points`
    : "Add real working examples to bind a unique egg";
  byId("lifecycle-readiness").textContent = `${evidence.readiness || 0}%`;
  byId("lifecycle-skills").textContent = String(evidence.learnedSkills || 0);
  byId("lifecycle-loops").textContent = String(evidence.loops || 0);
  byId("lifecycle-generation").textContent = identity ? String(identity.generation || 1) : "—";
  if (identity?.trainer && byId("lifecycle-trainer").value === "Local Trainer") byId("lifecycle-trainer").value = identity.trainer;

  const train = byId("lifecycle-train");
  train.textContent = result.hasAgentmon ? "TRAIN DERIVED TRAITS" : "INCUBATE SIGNAL";
  const evolve = byId("lifecycle-evolve");
  evolve.disabled = !evolution.ready || lifecycleBusy;
  evolve.textContent = evolution.ready ? "EVOLVE DNA" : "EVOLUTION LOCKED";

  const loopNodes = [...document.querySelectorAll(".foundation-loop span")];
  const attained = [
    evidence.sourceCount > 0,
    evidence.learnedSkills > 0 || evidence.loops > 0,
    evidence.arenaProven > 0,
    result.hasAgentmon,
    evidence.outcomes > 0,
    (identity?.generation || 1) > 1,
  ];
  loopNodes.forEach((node, index) => node.classList.toggle("active", attained[index]));

  const message = byId("lifecycle-message");
  message.className = "forge-status";
  if (!result.hasAgentmon) {
    message.textContent = "Your examples are processed transiently. Raw text is discarded after derived evidence and digests are sealed locally.";
  } else if (evolution.ready) {
    message.textContent = `Evolution ready: ${evolution.inherited} inherited + ${evolution.acquired} acquired skills produced ${evolution.fusions} unused fusion move${evolution.fusions === 1 ? "" : "s"}.`;
  } else {
    message.textContent = evolution.blockers?.[0] || "Keep training and proving useful behavior. DNA remains sealed.";
  }
}

function setLifecycleBusy(busy, label = "") {
  lifecycleBusy = busy;
  for (const id of ["lifecycle-trainer", "lifecycle-role", "lifecycle-prompts", "lifecycle-train"]) byId(id).disabled = busy;
  byId("lifecycle-train").classList.toggle("working", busy);
  byId("lifecycle-evolve").classList.toggle("working", busy);
  if (busy && label) byId("lifecycle-message").textContent = label;
  if (!busy && lifecycleState) {
    byId("lifecycle-train").textContent = lifecycleState.hasAgentmon ? "TRAIN DERIVED TRAITS" : "INCUBATE SIGNAL";
    byId("lifecycle-evolve").disabled = !lifecycleState.evolution?.ready;
    byId("lifecycle-evolve").textContent = lifecycleState.evolution?.ready ? "EVOLVE DNA" : "EVOLUTION LOCKED";
  }
}

function renderUnboundEngine() {
  engineState = null;
  byId("agent-name").textContent = "UNBOUND SIGNAL";
  byId("agent-resonance").textContent = "GENESIS FORGE READY";
  byId("engine-status").textContent = "Add real working examples in Home to hatch your first Agentmon. No template identity will be substituted.";
  byId("procedure-name").textContent = "NO INHERITED SKILL";
  byId("procedure-status").textContent = "Awaiting derived evidence";
  byId("work-intro").textContent = "Open Home and use Genesis Forge to bind a unique Agentmon before entering Agentmon Mode.";
  byId("composer-agentmon-state").textContent = "Unbound signal";
  document.querySelector(".monitor span").textContent = "GENESIS\nFORGE";
  byId("prompt").disabled = true;
  document.querySelector(".send-button").disabled = true;
  document.querySelector(".dock-label b").textContent = "Unbound";
  document.querySelector(".stage-context b").textContent = "Unbound signal";
  document.querySelector(".home-toolbar .eyebrow").textContent = "UNBOUND SIGNAL";
  document.querySelector(".home-toolbar h2").textContent = "Genesis Chamber";
  byId("detail-name").textContent = "Awaiting Hatch";
  byId("detail-species").textContent = "No Agentmon bound";
  setAgentmonAvatar("./assets/genesis-egg.png", "Unbound Agentmon egg");
}

async function loadLifecycle() {
  if (!invoke) return null;
  try {
    const result = await invoke("lifecycle_status");
    renderLifecycle(result);
    return result;
  } catch (error) {
    const message = byId("lifecycle-message");
    message.textContent = String(error);
    message.className = "forge-status error";
    return null;
  }
}

async function openSource(source) {
  if (!invoke) return;
  try {
    const result = await invoke("read_local_source", { source });
    document.querySelectorAll("[data-source]").forEach((button) => button.classList.toggle("active", button.dataset.source === source));
    document.querySelector('[data-surface="code"]').click();
    if (result.kind === "image") renderImageSource(result);
    else renderTextSource(result.name, result.path, result.content);
  } catch (error) {
    renderTextSource("Read error", "Local allowlist", String(error));
  }
}

function renderIdentity(result) {
  engineState = result;
  lastDownlink = result;
  const identity = result.identity;
  const procedures = result.procedures || [];
  const model = result.modelTarget;
  const primaryProcedure = procedures[0];

  document.querySelector(".dock-label b").textContent = identity.name;
  document.querySelector(".stage-context b").textContent = identity.name;
  document.querySelector(".home-toolbar .eyebrow").textContent = `${identity.name.toUpperCase()}’S HOME`;
  document.querySelector(".home-toolbar h2").textContent = `${titleCase(identity.resonance.mode)} Habitat`;
  const identityAvatar = proceduralAvatar(result.summary?.lineage?.currentDNA || identity.digest, result.summary?.lineage?.generation || 1);
  setAgentmonAvatar(identityAvatar, identity.name);
  byId("composer-agentmon-state").textContent = `${identity.name} automatic`;
  byId("agent-details-trigger").setAttribute("aria-label", `Open ${identity.name} details`);
  byId("prompt").setAttribute("aria-label", `Chat through ${identity.name}`);
  byId("agent-name").textContent = identity.name.toUpperCase();
  byId("agent-resonance").textContent = `${identity.resonance.mode.toUpperCase()} RESONANCE`;
  byId("work-intro").textContent = `Choose any connected model brain. ${identity.name} applies only identity and relevant proven skills; usefulness feedback trains the Agentmon, not the provider.`;
  document.querySelector(".monitor span").textContent = `${identity.name.toUpperCase()}\nL${lifecycleState?.level?.level || 1}`;
  byId("engine-status").textContent = `${titleCase(identity.permanentArchetype)} loaded from the project roster. ${identity.workingProfile.sampleCount} derived samples and ${identity.capabilities.length} trusted capabilities are active.`;
  byId("procedure-name").textContent = primaryProcedure?.name.toUpperCase() || "IDENTITY ONLY";
  byId("procedure-status").textContent = primaryProcedure ? "Arena-proven · advisory only" : "No proven procedure";
  byId("model-status").textContent = model ? `${model.model.toUpperCase()} · NOT CONNECTED` : "NO MODEL CONFIGURED";
  renderTextSource("SKILL.md", result.source.skillPath, result.skillMarkdown);
  byId("proven-count").textContent = procedures.length;
  byId("sample-count").textContent = identity.workingProfile.sampleCount;
  renderAgentmonDetails(result);
  renderReceipt(result);
}

function renderCompanion(result) {
  companionState = result;
  const running = result.running === true;
  if (!running && localModelConnected) setLocalModelConnection(false);
  const browser = result.browser || {};
  const paired = browser.paired === true;
  const dot = byId("connection-dot");
  dot.classList.toggle("offline", !running);
  dot.classList.toggle("waiting", running && !paired);
  byId("connection-label").textContent = paired ? "CHROME CONNECTED" : running ? "COMPANION ON" : "COMPANION OFF";
  byId("companion-title").textContent = paired ? "Agentmon is connected" : running ? "Waiting for Chrome" : "Companion is off";
  byId("companion-power").textContent = running ? "Stop" : "Start";
  byId("home-companion-power").textContent = running ? "TURN AGENTMON OFF" : "TURN AGENTMON ON";
  byId("home-companion-power").classList.toggle("running", running);
  byId("home-connection-state").textContent = paired ? "CHROME CONNECTED" : running ? "WAITING FOR CHROME" : "OFF";
  byId("browser-state").textContent = paired ? "Paired" : "Not paired";
  byId("browser-site").textContent = browser.siteEnabled ? browser.site : "None enabled";
  byId("browser-prompts").textContent = String(browser.promptCount || 0);
  byId("browser-downlink").textContent = browser.activeAgentmon?.name || "None active";
  byId("detail-browser").textContent = paired ? "Paired" : running ? "Waiting" : "Off";
  byId("detail-site").textContent = browser.siteEnabled ? browser.site : "None";
  byId("detail-prompts").textContent = String(browser.promptCount || 0);
  byId("detail-downlink").textContent = browser.activeAgentmon?.name || "None";
  byId("home-agent-status").textContent = paired && browser.siteEnabled
    ? `${engineState?.identity?.name || "Agentmon"} is linked to ${browser.site}`
    : paired
      ? "Chrome paired · enable one LLM site"
      : running
        ? "Companion on · waiting for Chrome"
        : "Companion sleeping";
  byId("pairing-code").textContent = result.pairingCode || "Unavailable";
  byId("pairing-row").hidden = !running || paired;
  byId("home-pairing-code").textContent = result.pairingCode || "Unavailable";
  byId("home-pairing-row").hidden = !running || paired;
  const localModel = result.localModel || {};
  const modelProvider = result.modelProvider || { provider: "local", model: localModel.model, baseUrl: localModel.baseUrl };
  byId("model-status").textContent = modelProvider.model ? `${modelProvider.provider} · ${modelProvider.model} · configured` : "Not connected";
  if (!localConfigHydrated && modelProvider.model) {
    localConfigHydrated = true;
    activeModelProvider = modelProvider.provider || "local";
    byId("model-provider").value = activeModelProvider;
    void selectModelProvider(activeModelProvider, modelProvider.model).then(() => {
      if (activeModelProvider === "local") byId("local-endpoint").value = modelProvider.baseUrl || localModel.baseUrl || "http://127.0.0.1:11434/v1";
      replaceModelChoices([modelProvider.model], modelProvider.model);
      showGatewayStatus("ready", `${modelProvider.model.toUpperCase()} · SAVED ${activeModelProvider.toUpperCase()} TARGET`, "Press Connect to verify and begin chatting.");
    });
  }
  byId("companion-privacy").textContent = `${result.privacy?.retention || "derived-only-browser"} · raw browser prompts stored: ${result.privacy?.rawBrowserPromptsStored === true ? "yes" : "no"}`;
  const error = result.error || "";
  byId("connection-error").textContent = error;
  byId("connection-error").hidden = !error;
}

function renderCompanionFailure(message) {
  renderCompanion({ running: false, error: message, browser: {}, localModel: {}, privacy: {} });
}

function showGatewayStatus(kind, title, detail) {
  const dot = byId("gateway-dot");
  dot.classList.toggle("connected", kind === "connected");
  dot.classList.toggle("error", kind === "error");
  byId("gateway-title").textContent = title;
  byId("gateway-detail").textContent = detail;
}

function setGatewayBusy(busy) {
  localModelBusy = busy;
  for (const id of ["model-provider", "local-runtime", "local-endpoint", "provider-key", "local-model", "local-scan", "local-connect"]) {
    byId(id).disabled = busy;
  }
  byId("local-connect").textContent = busy ? "WORKING…" : localModelConnected ? "CONNECTED" : "CONNECT";
  document.querySelector(".send-button").disabled = busy || !localModelConnected;
  byId("prompt").disabled = !localModelConnected;
}

function setLocalModelConnection(connected, model = "", provider = activeModelProvider) {
  localModelConnected = connected;
  const prompt = byId("prompt");
  prompt.disabled = !connected;
  prompt.placeholder = connected ? `Ask normally—${engineState?.identity?.name || "your Agentmon"} is applied automatically…` : "Connect a model provider above to begin…";
  document.querySelector(".send-button").disabled = !connected || localModelBusy;
  byId("local-connect").textContent = connected ? "CONNECTED" : "CONNECT";
  byId("composer-model-state").textContent = connected ? `${model} · ${provider}` : "Model disconnected";
  if (connected) {
    const local = provider === "local";
    showGatewayStatus("connected", `${model.toUpperCase()} · ${provider.toUpperCase()}`, local
      ? "Ready. Prompts go only to this loopback model server."
      : `Ready. Prompts go directly to ${provider}; Agentmon servers receive neither prompts nor responses.`);
  }
}

async function selectModelProvider(provider, configuredModel = "") {
  activeModelProvider = provider;
  localChatHistory = [];
  setLocalModelConnection(false, "", provider);
  const local = provider === "local";
  byId("local-runtime").hidden = !local;
  byId("local-endpoint").hidden = !local;
  byId("provider-key").hidden = local;
  byId("local-scan").textContent = local ? "SCAN THIS DEVICE" : "SAVE KEY + LOAD MODELS";
  byId("local-model").placeholder = local ? "CHOOSE OR TYPE MODEL" : `CHOOSE ${provider.toUpperCase()} MODEL`;
  replaceModelChoices([], configuredModel);
  if (local) {
    showGatewayStatus("ready", "LOCAL PROVIDER SELECTED", "Device-only. Start a local runtime and scan this device.");
    return;
  }
  let configured = false;
  try {
    configured = (await invoke("model_provider_secret_status", { input: { provider } })).configured === true;
  } catch {}
  byId("provider-key").value = "";
  byId("provider-key").placeholder = configured ? "KEY SAVED IN SYSTEM VAULT" : `${provider.toUpperCase()} API KEY`;
  showGatewayStatus("ready", `${provider.toUpperCase()} PROVIDER SELECTED`, configured
    ? "Secure system credential found. Load models or enter a model name."
    : "Add an API key. It is stored in the operating-system credential vault, never in the project or Agentmon database.");
}

function replaceModelChoices(models, selected = "") {
  const input = byId("local-model");
  const list = byId("local-model-list");
  const values = [...new Set((models || []).filter(Boolean))];
  list.replaceChildren();
  for (const model of values) {
    const option = document.createElement("option");
    option.value = model;
    list.append(option);
  }
  input.placeholder = values.length ? "CHOOSE OR TYPE MODEL" : "TYPE MODEL NAME";
  input.value = values.includes(selected) ? selected : values.length === 1 ? values[0] : selected;
}

function chooseRuntime(baseUrl, preferredModel = "") {
  const runtime = localRuntimes.find((item) => item.baseUrl === baseUrl);
  byId("local-endpoint").value = baseUrl || "http://127.0.0.1:11434/v1";
  replaceModelChoices(runtime?.models || [], preferredModel);
  setLocalModelConnection(false);
  if (runtime) showGatewayStatus("ready", `${runtime.runtime.toUpperCase()} FOUND`, `${runtime.models.length} local model${runtime.models.length === 1 ? "" : "s"} available. Choose one and connect.`);
}

async function discoverLocalModels(autoConnect = false) {
  if (!invoke || localModelBusy) return;
  let connectAfterScan = false;
  setGatewayBusy(true);
  showGatewayStatus("ready", "SCANNING LOOPBACK RUNTIMES", "Checking approved local ports only. No internet request is made.");
  try {
    const result = await invoke("local_model_discover");
    localRuntimes = result.runtimes || [];
    const runtimeSelect = byId("local-runtime");
    runtimeSelect.replaceChildren();
    for (const runtime of localRuntimes) {
      const option = document.createElement("option");
      option.value = runtime.baseUrl;
      option.textContent = runtime.runtime;
      runtimeSelect.append(option);
    }
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "CUSTOM / MANUAL";
    runtimeSelect.append(custom);
    if (!localRuntimes.length) {
      runtimeSelect.value = "custom";
      replaceModelChoices([], "");
      showGatewayStatus("error", "NO LOCAL MODEL SERVER FOUND", "Start Ollama, LM Studio, or another OpenAI-compatible local server, then scan again.");
      return;
    }
    const configured = companionState?.localModel || {};
    const preferred = localRuntimes.find((item) => item.baseUrl === configured.baseUrl) || localRuntimes[0];
    runtimeSelect.value = preferred.baseUrl;
    chooseRuntime(preferred.baseUrl, configured.model || "");
    connectAfterScan = autoConnect && configured.model && preferred.models.includes(configured.model);
  } catch (error) {
    showGatewayStatus("error", "LOCAL SCAN FAILED", String(error));
  } finally {
    setGatewayBusy(false);
  }
  if (connectAfterScan) await connectLocalModel();
}

async function connectLocalModel() {
  if (!invoke || localModelBusy) return;
  if (activeModelProvider !== "local") return connectCloudModel();
  const baseUrl = byId("local-endpoint").value.trim();
  const model = byId("local-model").value.trim();
  if (!baseUrl || !model) {
    showGatewayStatus("error", "CHOOSE A LOCAL MODEL", "Scan this device or enter an endpoint, then choose a loaded model.");
    return;
  }
  setGatewayBusy(true);
  showGatewayStatus("ready", "CONNECTING LOCALLY", `${baseUrl} · credentials are not stored.`);
  try {
    const result = await invoke("model_provider_connect", { input: { provider: "local", baseUrl, model } });
    setLocalModelConnection(result.connected === true, result.model || model, "local");
  } catch (error) {
    setLocalModelConnection(false);
    showGatewayStatus("error", "LOCAL MODEL CONNECTION FAILED", String(error));
  } finally {
    setGatewayBusy(false);
  }
}

async function saveCloudKeyIfPresent() {
  const apiKey = byId("provider-key").value.trim();
  if (!apiKey) return;
  await invoke("model_provider_secret_set", { input: { provider: activeModelProvider, apiKey } });
  byId("provider-key").value = "";
  byId("provider-key").placeholder = "KEY SAVED IN SYSTEM VAULT";
}

async function loadProviderModels() {
  if (activeModelProvider === "local") return discoverLocalModels(false);
  if (!invoke || localModelBusy) return;
  setGatewayBusy(true);
  showGatewayStatus("ready", `CONNECTING TO ${activeModelProvider.toUpperCase()}`, "Saving the key to the operating-system credential vault, then requesting the available model list.");
  try {
    await saveCloudKeyIfPresent();
    const result = await invoke("model_provider_models", { input: { provider: activeModelProvider } });
    replaceModelChoices(result.models || [], byId("local-model").value.trim());
    showGatewayStatus("ready", `${result.models.length} ${activeModelProvider.toUpperCase()} MODELS AVAILABLE`, "Choose a model, then press Connect.");
  } catch (error) {
    showGatewayStatus("error", `${activeModelProvider.toUpperCase()} SETUP FAILED`, String(error));
  } finally {
    setGatewayBusy(false);
  }
}

async function connectCloudModel() {
  if (!invoke || localModelBusy) return;
  const provider = activeModelProvider;
  const model = byId("local-model").value.trim();
  if (!model) {
    showGatewayStatus("error", "CHOOSE A CLOUD MODEL", "Load the provider model list or enter an exact model name.");
    return;
  }
  setGatewayBusy(true);
  showGatewayStatus("ready", `CONNECTING TO ${provider.toUpperCase()}`, "The API key remains in the operating-system credential vault and is never written to this project.");
  try {
    await saveCloudKeyIfPresent();
    const result = await invoke("model_provider_connect", { input: { provider, model } });
    setLocalModelConnection(result.connected === true, result.model || model, provider);
  } catch (error) {
    setLocalModelConnection(false, "", provider);
    showGatewayStatus("error", `${provider.toUpperCase()} CONNECTION FAILED`, String(error));
  } finally {
    setGatewayBusy(false);
  }
}

function renderCodexPlugin(result) {
  const setup = byId("codex-setup");
  const homeSetup = byId("home-codex-setup");
  const button = byId("codex-plugin-install");
  const homeButton = byId("home-codex-install");
  const installed = result?.installed === true && result?.enabled === true;
  setup.classList.toggle("connected", installed);
  homeSetup.classList.toggle("connected", installed);
  setup.classList.remove("error");
  homeSetup.classList.remove("error");
  byId("codex-plugin-state").textContent = installed
    ? `Connected${result.version ? ` · v${result.version}` : ""}`
    : "Not connected";
  byId("codex-plugin-message").textContent = result?.message
    || (installed
      ? "Open a new Codex chat and say “Activate Guardot.”"
      : "Install once to make Agentmon Mode available in Codex.");
  byId("home-codex-state").textContent = byId("codex-plugin-state").textContent;
  byId("home-codex-message").textContent = byId("codex-plugin-message").textContent;
  button.textContent = installed ? "CONNECTED" : "INSTALL";
  button.disabled = installed;
  homeButton.textContent = installed ? "CONNECTED" : "INSTALL";
  homeButton.disabled = installed;
}

function renderCodexPluginFailure(message) {
  const setup = byId("codex-setup");
  const homeSetup = byId("home-codex-setup");
  setup.classList.remove("connected");
  setup.classList.add("error");
  homeSetup.classList.remove("connected");
  homeSetup.classList.add("error");
  byId("codex-plugin-state").textContent = "Setup unavailable";
  byId("codex-plugin-message").textContent = message;
  byId("home-codex-state").textContent = "Setup unavailable";
  byId("home-codex-message").textContent = message;
  const button = byId("codex-plugin-install");
  const homeButton = byId("home-codex-install");
  button.textContent = "RETRY";
  button.disabled = false;
  homeButton.textContent = "RETRY";
  homeButton.disabled = false;
}

async function loadCodexPluginStatus() {
  if (!invoke) {
    renderCodexPluginFailure("Open the packaged Agentmon.app to connect Codex.");
    return;
  }
  try {
    renderCodexPlugin(await invoke("codex_plugin_status"));
  } catch (error) {
    renderCodexPluginFailure(String(error));
  }
}

async function startCompanion() {
  if (!invoke || companionRequestInFlight) {
    if (!invoke) renderCompanionFailure("Open the packaged Agentmon.app to run the local companion.");
    return;
  }
  companionRequestInFlight = true;
  try {
    const result = await invoke("companion_start");
    renderCompanion(result);
    return result;
  } catch (error) {
    renderCompanionFailure(String(error));
  } finally {
    companionRequestInFlight = false;
  }
}

async function pollCompanion() {
  if (!invoke || document.hidden || companionRequestInFlight || companionState?.running !== true) return;
  companionRequestInFlight = true;
  try {
    renderCompanion(await invoke("companion_status"));
  } catch (error) {
    renderCompanionFailure(String(error));
  } finally {
    companionRequestInFlight = false;
  }
}

function scheduleCompanionPoll(delay = 5000) {
  if (companionPollTimer) window.clearTimeout(companionPollTimer);
  if (document.hidden) return;
  companionPollTimer = window.setTimeout(async () => {
    await pollCompanion();
    scheduleCompanionPoll();
  }, delay);
}

function setEngineFailure(message) {
  byId("agent-name").textContent = "ENGINE OFFLINE";
  byId("agent-resonance").textContent = "NO MOCK FALLBACK";
  byId("engine-status").textContent = message;
  byId("procedure-name").textContent = "NOT LOADED";
  byId("procedure-status").textContent = "Real local source required";
  byId("prompt").disabled = true;
  document.querySelector(".send-button").disabled = true;
}

async function loadIdentity() {
  if (!invoke) {
    setEngineFailure("Open the packaged Agentmon.app to use the Rust bridge. Browser preview mode does not fabricate engine data.");
    return;
  }
  try {
    renderIdentity(await invoke("agentmon_identity"));
  } catch (error) {
    if (lifecycleState?.hasAgentmon === false) renderUnboundEngine();
    else setEngineFailure(String(error));
  }
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

document.querySelectorAll("[data-surface]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".surface-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(".surface").forEach((surface) => surface.classList.toggle("active", surface.id === `${button.dataset.surface}-surface`));
}));

document.querySelectorAll("[data-source]").forEach((button) => button.addEventListener("click", () => openSource(button.dataset.source)));

byId("folder-toggle").addEventListener("click", (event) => {
  const list = byId("file-list");
  list.hidden = !list.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!list.hidden));
  byId("folder-chevron").textContent = list.hidden ? "›" : "⌄";
});

byId("file-search").addEventListener("input", (event) => {
  const query = event.currentTarget.value.trim().toLowerCase();
  if (query) {
    byId("file-list").hidden = false;
    byId("folder-toggle").setAttribute("aria-expanded", "true");
    byId("folder-chevron").textContent = "⌄";
  }
  document.querySelectorAll("[data-source]").forEach((button) => {
    button.hidden = Boolean(query) && !button.textContent.toLowerCase().includes(query);
  });
});

const receiptPopover = byId("receipt-popover");
byId("skill-receipt").addEventListener("click", () => { receiptPopover.hidden = !receiptPopover.hidden; });

const connectionPopover = byId("connection-popover");
byId("connection-toggle").addEventListener("click", () => { connectionPopover.hidden = !connectionPopover.hidden; });
async function toggleCompanion() {
  if (!invoke || companionRequestInFlight) return;
  companionRequestInFlight = true;
  try {
    renderCompanion(companionState?.running ? await invoke("companion_stop") : await invoke("companion_start"));
  } catch (error) {
    renderCompanionFailure(String(error));
  } finally {
    companionRequestInFlight = false;
  }
}
byId("companion-power").addEventListener("click", toggleCompanion);
byId("home-companion-power").addEventListener("click", toggleCompanion);

async function copyPairingCode(button) {
  if (!invoke) return;
  try {
    await invoke("copy_pairing_code");
    button.textContent = "COPIED";
    window.setTimeout(() => { button.textContent = "COPY"; }, 1200);
  } catch (error) {
    byId("connection-error").textContent = String(error);
    byId("connection-error").hidden = false;
  }
}
byId("copy-pairing-code").addEventListener("click", (event) => copyPairingCode(event.currentTarget));
byId("home-copy-pairing").addEventListener("click", (event) => copyPairingCode(event.currentTarget));

async function installCodexPlugin() {
  if (!invoke) return;
  const button = byId("codex-plugin-install");
  const homeButton = byId("home-codex-install");
  const setup = byId("codex-setup");
  button.disabled = true;
  homeButton.disabled = true;
  button.textContent = "INSTALLING…";
  homeButton.textContent = "INSTALLING…";
  setup.classList.remove("error");
  byId("codex-plugin-state").textContent = "Connecting Codex…";
  byId("codex-plugin-message").textContent = "Registering the local plugin and preparing Guardot’s runtime pack.";
  try {
    renderCodexPlugin(await invoke("install_codex_plugin"));
  } catch (error) {
    renderCodexPluginFailure(String(error));
  }
}
byId("codex-plugin-install").addEventListener("click", installCodexPlugin);
byId("home-codex-install").addEventListener("click", installCodexPlugin);

byId("home-open-chrome").addEventListener("click", async () => {
  if (!invoke) return;
  try {
    await invoke("open_chrome_extensions");
    byId("home-extension-note").textContent = "Chrome Extensions opened. Turn Developer Mode on, then choose Load unpacked.";
  } catch (error) {
    byId("home-extension-note").textContent = String(error);
  }
});

byId("home-get-extension").addEventListener("click", async (event) => {
  if (!invoke) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "PREPARING…";
  try {
    const result = await invoke("install_chrome_extension");
    byId("home-extension-note").textContent = result.message;
    button.textContent = "EXTENSION READY";
  } catch (error) {
    byId("home-extension-note").textContent = String(error);
    button.textContent = "RETRY";
  } finally {
    button.disabled = false;
  }
});

byId("lifecycle-train").addEventListener("click", async () => {
  if (!invoke || lifecycleBusy) return;
  const prompts = byId("lifecycle-prompts").value
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
  setLifecycleBusy(true, lifecycleState?.hasAgentmon ? "DERIVING NEW EVIDENCE · DNA REMAINS SEALED…" : "BINDING A UNIQUE SIGNAL · RAW TEXT WILL BE DISCARDED…");
  try {
    const result = await invoke("lifecycle_train", {
      input: {
        trainerName: byId("lifecycle-trainer").value.trim(),
        role: byId("lifecycle-role").value,
        prompts,
      },
    });
    renderLifecycle(result);
    byId("lifecycle-prompts").value = "";
    const message = byId("lifecycle-message");
    message.className = "forge-status success";
    message.textContent = result.action === "hatched"
      ? `${result.identity.name} is bound to DNA ${result.identity.dna}. Keep training until the egg reaches stable hatch readiness.`
      : `${result.identity.name} absorbed derived evidence. Level ${result.level.level}; DNA ${result.identity.dna} did not change.`;
    await loadIdentity();
  } catch (error) {
    const message = byId("lifecycle-message");
    message.className = "forge-status error";
    message.textContent = String(error);
  } finally {
    setLifecycleBusy(false);
  }
});

byId("lifecycle-evolve").addEventListener("click", async () => {
  if (!invoke || lifecycleBusy || !lifecycleState?.evolution?.ready) return;
  setLifecycleBusy(true, "VERIFYING OWNERSHIP, FUSION PROVENANCE, AND UNUSED DNA EVENT…");
  byId("lifecycle-evolve").disabled = true;
  try {
    const previousDna = lifecycleState.identity?.dna;
    const result = await invoke("lifecycle_evolve");
    renderLifecycle(result);
    const message = byId("lifecycle-message");
    message.className = "forge-status success";
    message.textContent = `${result.identity.name} evolved: Generation ${result.identity.generation}. DNA ${previousDna} → ${result.identity.dna}. The lineage event is permanent.`;
    await loadIdentity();
  } catch (error) {
    const message = byId("lifecycle-message");
    message.className = "forge-status error";
    message.textContent = String(error);
  } finally {
    setLifecycleBusy(false);
  }
});

const detailsDrawer = byId("details-drawer");
byId("agent-details-trigger").addEventListener("click", () => {
  setView("home");
  detailsDrawer.scrollTo({ top: 0, behavior: "smooth" });
});

const prompt = byId("prompt");
prompt.addEventListener("input", () => {
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(prompt.scrollHeight, 140)}px`;
});

byId("local-scan").addEventListener("click", loadProviderModels);
byId("local-connect").addEventListener("click", connectLocalModel);
byId("model-provider").addEventListener("change", (event) => selectModelProvider(event.currentTarget.value));
byId("local-runtime").addEventListener("change", (event) => {
  if (event.currentTarget.value === "custom") {
    setLocalModelConnection(false);
    replaceModelChoices([], "");
    showGatewayStatus("ready", "CUSTOM LOOPBACK RUNTIME", "Enter its local /v1 endpoint and exact loaded model name.");
    return;
  }
  chooseRuntime(event.currentTarget.value, "");
});
for (const id of ["local-endpoint", "local-model", "provider-key"]) {
  byId(id).addEventListener("input", () => {
    if (localModelConnected) {
      setLocalModelConnection(false);
      showGatewayStatus("ready", "MODEL SETTINGS CHANGED", "Press Connect to use the updated provider settings.");
    }
  });
}
byId("agentmon-mode").addEventListener("change", (event) => {
  const enabled = event.currentTarget.checked;
  localChatHistory = [];
  byId("agentmon-mode-title").textContent = enabled ? "AGENTMON MODE · ON" : "GENERIC MODE · BASELINE";
  byId("composer-agentmon-state").textContent = enabled ? `${engineState?.identity?.name || "Agentmon"} automatic` : "Generic baseline";
  byId("gateway-detail").textContent = enabled
    ? "Identity + relevant proven skills are applied automatically. Conversation memory was cleared."
    : "Agentmon identity and skills are disabled for comparison. Conversation memory was cleared.";
});

function buildOutcomeControls(feedback) {
  const panel = document.createElement("div");
  panel.className = "outcome-controls";
  if (!feedback?.eligible || !feedback.token) {
    panel.classList.add("unavailable");
    panel.textContent = feedback?.reason || "No proven procedure was active, so this answer cannot train a skill yet.";
    return panel;
  }
  const label = document.createElement("span");
  label.textContent = "DID AGENTMON HELP?";
  panel.append(label);
  for (const [value, title] of [["helped", "HELPED"], ["missed", "MISSED"], ["retry", "RETRY"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.feedback = value;
    button.textContent = title;
    button.addEventListener("click", async () => {
      panel.querySelectorAll("button").forEach((control) => { control.disabled = true; });
      label.textContent = "RECORDING DERIVED-ONLY EVIDENCE…";
      try {
        const result = await invoke("model_provider_outcome", { input: { token: feedback.token, feedback: value } });
        label.textContent = `${title} RECORDED · ${result.totalOutcomes} OUTCOMES · SCORE ${result.score}`;
        panel.classList.add("recorded", value);
        if (value === "retry") byId("prompt").focus();
        await loadIdentity();
        await loadLifecycle();
      } catch (error) {
        label.textContent = `FEEDBACK FAILED · ${String(error)}`;
        panel.classList.add("error");
      }
    });
    panel.append(button);
  }
  return panel;
}

byId("composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text || !invoke || !engineState || !localModelConnected || localModelBusy) return;
  const conversation = byId("conversation");
  const article = document.createElement("article");
  article.className = "message user-message new-message";
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = "TRANSIENT TASK";
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  article.append(label, body);
  conversation.append(article);
  prompt.value = "";
  prompt.style.height = "auto";
  setGatewayBusy(true);
  showGatewayStatus("ready", activeModelProvider === "local" ? "THINKING ON THIS DEVICE" : `THINKING WITH ${activeModelProvider.toUpperCase()}`, "Agentmon is selecting relevant identity and proven skills, then calling the selected model.");

  try {
    const agentmonMode = byId("agentmon-mode").checked;
    const result = await invoke("model_provider_chat", {
      input: {
        provider: activeModelProvider,
        slot: "main",
        conversation: localConversationId,
        prompt: text,
        history: localChatHistory.slice(-12),
        agentmonMode,
        maxOutputTokens: 1600,
      },
    });
    const receipt = {
      identity: result.receipt?.identity || null,
      procedures: result.receipt?.procedures || [],
      queryDigest: result.receipt?.queryDigest || "",
      routing: result.receipt?.routing || null,
      delivery: result.receipt?.delivery || {},
      privacy: result.privacy || {},
    };
    lastDownlink = receipt;
    renderReceipt(receipt);
    localChatHistory.push({ role: "user", content: text }, { role: "assistant", content: result.answer });
    localChatHistory = localChatHistory.slice(-12);
    const procedures = receipt.procedures;
    const response = document.createElement("article");
    response.className = "message agent-message new-message";
    const avatar = document.createElement("div");
    avatar.className = "agent-avatar";
    const avatarImage = document.createElement("img");
    avatarImage.src = agentmonMode
      ? proceduralAvatar(engineState.summary?.lineage?.currentDNA || engineState.identity.digest, engineState.summary?.lineage?.generation || 1)
      : "./assets/guardot.png";
    avatarImage.alt = agentmonMode ? (result.agentmon?.name || "Agentmon") : "Local model";
    avatar.append(avatarImage);
    const column = document.createElement("div");
    column.className = "message-column";
    const heading = document.createElement("div");
    heading.className = "message-label";
    const headingName = document.createElement("b");
    headingName.textContent = agentmonMode ? `${(result.agentmon?.name || "AGENTMON").toUpperCase()} · ${result.provider.toUpperCase()} · ${result.model}` : `GENERIC ${result.provider.toUpperCase()} · ${result.model}`;
    const headingState = document.createElement("span");
    headingState.textContent = agentmonMode ? "AGENTMON APPLIED" : "BASELINE · NO AGENTMON";
    heading.append(headingName, headingState);
    const message = document.createElement("div");
    message.className = "message-body";
    message.textContent = result.answer;
    const proof = document.createElement("div");
    proof.className = "inline-proof";
    const applied = agentmonMode
      ? procedures.length ? procedures.map((item) => item.name).join(", ") : "identity only · router correctly stayed out"
      : "generic baseline";
    proof.textContent = `✓ ${applied} · ${receipt.queryDigest.slice(0, 12)} · raw prompt/response not stored by Agentmon`;
    column.append(heading, message, proof, buildOutcomeControls(result.feedback));
    response.append(avatar, column);
    conversation.append(response);
    showGatewayStatus("connected", `${result.model.toUpperCase()} · READY`, agentmonMode
      ? `${result.agentmon?.name || "Agentmon"} answered through ${result.provider} with ${procedures.length || "identity-only"} matched procedure${procedures.length === 1 ? "" : "s"}.`
      : `Generic ${result.provider} baseline answered without Agentmon identity or skills.`);
  } catch (error) {
    const failure = document.createElement("div");
    failure.className = "compile-error";
    failure.textContent = `Provider chat failed: ${String(error)}`;
    conversation.append(failure);
    showGatewayStatus("error", "PROVIDER CHAT FAILED", String(error));
  } finally {
    setGatewayBusy(false);
    conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }
});

byId("light-toggle").addEventListener("click", (event) => {
  const scene = byId("home-scene");
  const night = scene.classList.toggle("night");
  event.currentTarget.textContent = night ? "☾ Night light" : "☼ Evening light";
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#skill-receipt, #receipt-popover")) receiptPopover.hidden = true;
  if (!event.target.closest("#connection-toggle, #connection-popover")) connectionPopover.hidden = true;
});

async function bootstrapAgentmon() {
  const lifecycle = await loadLifecycle();
  if (lifecycle?.hasAgentmon) await loadIdentity();
  else renderUnboundEngine();
  await startCompanion();
  scheduleCompanionPoll();
  if (!localAutoConnectAttempted && companionState?.modelProvider?.provider === "local" && companionState?.localModel?.configured) {
    localAutoConnectAttempted = true;
    await discoverLocalModels(true);
  }
}

bootstrapAgentmon();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (companionPollTimer) window.clearTimeout(companionPollTimer);
    companionPollTimer = null;
  } else {
    scheduleCompanionPoll(250);
  }
});
