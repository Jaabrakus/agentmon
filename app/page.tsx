"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type AgentmonFeed, parseAgentmonFeed } from "./agentmon-feed";
import {
  type AgentInput,
  type Agentmon,
  type Move,
  type PromptprintKey,
  type ProviderKey,
  type RoleKey,
  type SkillKey,
  type TradePackage,
  type TrainingSource,
  createAgentInput,
  createSkillsMarkdown,
  createTradePackage,
  equipSkills,
  generateAgentmon,
  promptprintMeta,
  roleDefaults,
  skillLibrary,
  tradeCode,
  trainAgentmon,
} from "./agentmon-engine";

type Stage = "connect" | "egg" | "hatched";
type Tab = "promptprint" | "skills" | "loops" | "battle" | "trade";
type CodexConnection = "offline" | "connected" | "error";
type FeedFileHandle = { name: string; getFile: () => Promise<File> };
type FeedPickerWindow = Window & {
  showOpenFilePicker?: (options: { multiple: boolean; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FeedFileHandle[]>;
};

const providers: Array<{ id: ProviderKey; label: string; mark: string }> = [
  { id: "openai", label: "OpenAI", mark: "◎" }, { id: "anthropic", label: "Anthropic", mark: "A" }, { id: "google", label: "Google", mark: "G" }, { id: "local", label: "Local", mark: "⌂" }, { id: "custom", label: "Custom", mark: "+" },
];
const roles = Object.keys(roleDefaults) as RoleKey[];
const allSkills = Object.keys(skillLibrary) as SkillKey[];

function PromptprintBar({ dimension, value }: { dimension: PromptprintKey; value: number }) {
  const meta = promptprintMeta[dimension];
  return <div className="promptprint-row"><div><span>{meta.icon} {meta.label}</span><b>{value}</b></div><div className="promptprint-track"><i style={{ width: `${value}%`, background: meta.color }} /></div></div>;
}

function PixelEgg({ agentmon, cracking = false }: { agentmon: Agentmon; cracking?: boolean }) {
  return <div className={`pixel-egg egg-${agentmon.variant} ${cracking ? "cracking" : ""}`} style={{ "--egg-color": agentmon.primaryColor, "--egg-accent": agentmon.accentColor } as React.CSSProperties} role="img" aria-label={`${agentmon.primaryType} Agentmon egg`}><i className="egg-spot spot-one" /><i className="egg-spot spot-two" /><i className="egg-spot spot-three" /><span className="egg-crack">⌁</span></div>;
}

function PixelCreature({ agentmon }: { agentmon: Agentmon }) {
  return <div className={`creature variant-${agentmon.variant}`} style={{ "--creature": agentmon.primaryColor, "--accent": agentmon.accentColor } as React.CSSProperties} role="img" aria-label={`${agentmon.species}, a ${agentmon.primaryType} Agentmon`}><div className="creature-shadow" /><div className="tail"><i /></div><div className="ear ear-left" /><div className="ear ear-right" /><div className="antenna"><i /></div><div className="creature-body"><div className="face"><i className="eye eye-left" /><i className="eye eye-right" /><i className="mouth" /></div><div className="core">{agentmon.coreGlyph}</div><div className="foot foot-left" /><div className="foot foot-right" /></div></div>;
}

function MoveCard({ move }: { move: Move }) {
  return <div className="move-card"><span className="move-icon">{move.icon}</span><div><strong>{move.name}</strong><small>{move.type} · PWR {move.power}</small><p>{move.description}</p></div></div>;
}

function downloadFile(name: string, content: string, type: string) {
  const file = new Blob([content], { type }); const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [input, setInput] = useState<AgentInput>(() => createAgentInput());
  const [agentmon, setAgentmon] = useState<Agentmon>(() => generateAgentmon(createAgentInput()));
  const [sources, setSources] = useState<TrainingSource[]>([]);
  const [feedText, setFeedText] = useState("");
  const [feedName, setFeedName] = useState("System prompt");
  const [stage, setStage] = useState<Stage>("connect");
  const [tab, setTab] = useState<Tab>("promptprint");
  const [isHatching, setIsHatching] = useState(false);
  const [notice, setNotice] = useState("");
  const [enemyHp, setEnemyHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [battleLog, setBattleLog] = useState("Choose a learned move to begin the training battle.");
  const [codexConnection, setCodexConnection] = useState<CodexConnection>("offline");
  const [codexFeed, setCodexFeed] = useState<AgentmonFeed | null>(null);
  const [feedHandle, setFeedHandle] = useState<FeedFileHandle | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const lastFeedRevision = useRef<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("agentmon:creature:v1");
    if (!saved) return;
    const restore = window.setTimeout(() => {
      try { const restored = JSON.parse(saved) as Agentmon; if (restored.id && restored.learnedSkills && restored.promptprint) { setAgentmon({ ...restored, skillPackages: restored.skillPackages ?? [], combinations: restored.combinations ?? [], loops: restored.loops ?? [] }); setStage("hatched"); } else { window.localStorage.removeItem("agentmon:creature:v1"); } } catch { window.localStorage.removeItem("agentmon:creature:v1"); }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (stage === "hatched") window.localStorage.setItem("agentmon:creature:v1", JSON.stringify(agentmon));
  }, [agentmon, stage]);

  useEffect(() => {
    if (!feedHandle) return;
    let reading = false;
    const poll = window.setInterval(async () => {
      if (reading) return;
      reading = true;
      try {
        const file = await feedHandle.getFile();
        const feed = parseAgentmonFeed(await file.text());
        if (feed.revision !== lastFeedRevision.current) applyCodexFeed(feed);
      } catch {
        setCodexConnection("error");
      } finally {
        reading = false;
      }
    }, 3000);
    return () => window.clearInterval(poll);
  });

  const equippedSkills = useMemo(() => agentmon.moves.map((move) => move.id).filter((id): id is SkillKey => id in skillLibrary), [agentmon.moves]);
  const learnedIds = useMemo(() => agentmon.learnedSkills.map((skill) => skill.id), [agentmon.learnedSkills]);

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 1800); }
  function updateRole(role: RoleKey) { setInput((current) => ({ ...current, role, skills: [...roleDefaults[role].skills] })); }

  function makeSource(name: string, content: string, kind: TrainingSource["kind"]): TrainingSource {
    return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, kind, content, size: content.length };
  }

  function applyCodexFeed(feed: AgentmonFeed, handle?: FeedFileHandle) {
    const codexSources: TrainingSource[] = feed.prompts.map((prompt, index) => ({
      id: `codex:${feed.thread.id}:${prompt.id}`,
      name: `Codex prompt ${String(index + 1).padStart(2, "0")}`,
      kind: "history",
      content: prompt.text,
      size: prompt.chars,
    }));
    const merged = [...sources.filter((source) => !source.id.startsWith("codex:")), ...codexSources];
    setSources(merged);
    setCodexFeed(feed);
    setCodexConnection("connected");
    lastFeedRevision.current = feed.revision;
    if (handle) setFeedHandle(handle);
    if (stage === "connect") {
      setAgentmon(generateAgentmon({ ...input, provider: "openai" }, merged));
      setStage("egg");
      setTab("promptprint");
      flash(`Codex connected · ${feed.totals.prompts} prompts received`);
    } else {
      setAgentmon((current) => trainAgentmon(current, input, merged));
      flash(`Live Promptprint updated · ${feed.totals.prompts} prompts`);
    }
  }

  async function importCodexFeed(file: File | undefined, handle?: FeedFileHandle) {
    if (!file) return;
    try {
      applyCodexFeed(parseAgentmonFeed(await file.text()), handle);
    } catch {
      setCodexConnection("error");
      flash("That is not a valid Agentmon Codex feed");
    }
  }

  async function connectCodex() {
    setShowConsent(false);
    const picker = (window as FeedPickerWindow).showOpenFilePicker;
    if (!picker) {
      document.getElementById("codex-feed-input")?.click();
      return;
    }
    try {
      const [handle] = await picker({ multiple: false, types: [{ description: "Agentmon Codex feed", accept: { "application/json": [".json"] } }] });
      if (handle) await importCodexFeed(await handle.getFile(), handle);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setCodexConnection("error");
    }
  }

  function disconnectCodex() {
    setFeedHandle(null);
    setCodexFeed(null);
    setCodexConnection("offline");
    lastFeedRevision.current = null;
    setSources((current) => current.filter((source) => !source.id.startsWith("codex:")));
    flash("Codex feed disconnected");
  }

  function addFeed() {
    const content = feedText.trim(); if (!content) return;
    setSources((current) => [...current, makeSource(feedName.trim() || "Prompt feed", content, /skill/i.test(feedName) ? "skills" : "prompt")]);
    setFeedText(""); flash("Added to the training feed");
  }

  async function uploadFiles(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files).filter((file) => /\.(md|txt|json|js|ts|py|sh|ya?ml)$/i.test(file.name) && file.size <= 1_000_000).slice(0, 24);
    const packageBatch = accepted.some((file) => /(^|\/)skill\.md$/i.test(file.webkitRelativePath || file.name));
    const packageRoot = `skill-package-${Date.now()}`;
    const loaded = await Promise.all(accepted.map(async (file) => {
      const path = file.webkitRelativePath || (packageBatch ? `${packageRoot}/${file.name}` : file.name);
      const kind: TrainingSource["kind"] = /(^|\/)skill\.md$/i.test(path) ? "skills" : /\.json$/i.test(path) ? "json" : /\.(md|txt)$/i.test(path) ? "history" : "resource";
      return makeSource(path, await file.text(), kind);
    }));
    setSources((current) => [...current, ...loaded]); flash(`${loaded.length} file${loaded.length === 1 ? "" : "s"} added locally`);
  }

  function generateEgg() {
    const pending = feedText.trim() ? [...sources, makeSource(feedName, feedText.trim(), "prompt")] : sources;
    if (pending !== sources) { setSources(pending); setFeedText(""); }
    if (pending.length === 0) { flash("Feed at least one prompt, history, or SKILL.md first"); return; }
    setAgentmon(generateAgentmon(input, pending)); setStage("egg"); setTab("promptprint");
  }

  function hatch() { setIsHatching(true); window.setTimeout(() => { setIsHatching(false); setStage("hatched"); }, 1100); }

  function train() {
    const pending = feedText.trim() ? [...sources, makeSource(feedName, feedText.trim(), "history")] : sources;
    if (pending !== sources) { setSources(pending); setFeedText(""); }
    setAgentmon((current) => trainAgentmon(current, input, pending)); flash("Skills and loops updated");
  }

  function newEgg() { setStage("connect"); setTab("promptprint"); setSources([]); setFeedText(""); setEnemyHp(100); setPlayerHp(100); setFeedHandle(null); setCodexFeed(null); setCodexConnection("offline"); lastFeedRevision.current = null; window.localStorage.removeItem("agentmon:creature:v1"); }

  function toggleSkill(skill: SkillKey) {
    if (!learnedIds.includes(skill)) { flash("Feed evidence to learn this skill first"); return; }
    const next = equippedSkills.includes(skill) ? equippedSkills.filter((item) => item !== skill) : [...equippedSkills, skill].slice(-4);
    setAgentmon((current) => equipSkills(current, next));
  }

  function playMove(move: Move) {
    if (enemyHp <= 0 || playerHp <= 0) return;
    const damage = Math.round(move.power / 3.2); const nextEnemy = Math.max(0, enemyHp - damage); const counter = nextEnemy === 0 ? 0 : 12 + agentmon.variant;
    setEnemyHp(nextEnemy); setPlayerHp(Math.max(0, playerHp - counter)); setBattleLog(nextEnemy === 0 ? `${agentmon.species} wins with ${move.name}!` : `${move.name} dealt ${damage}. Nullbyte countered for ${counter}.`);
  }

  async function copyText(value: string) { await navigator.clipboard.writeText(value); flash("Copied to clipboard"); }

  async function importTrade(file: File | undefined) {
    if (!file) return;
    try { const packet = JSON.parse(await file.text()) as TradePackage; if (packet.format !== "agentmon.trade/v1" || !packet.creature?.id || !packet.creature.promptprint) throw new Error("Invalid package"); setAgentmon({ ...packet.creature, skillPackages: packet.creature.skillPackages ?? [], combinations: packet.creature.combinations ?? [], loops: packet.creature.loops ?? [], trainedAt: new Date().toISOString() }); setStage("hatched"); setTab("promptprint"); flash("Traded Agentmon imported"); } catch { flash("That is not a valid Agentmon trade package"); }
  }

  const embedCode = `<Agentmon agent="${agentmon.id}" skills={[${agentmon.moves.map((move) => `"${move.id}"`).join(", ")}]} />`;

  return (
    <main className="app-shell">
      <header className="topbar"><a className="brand" href="#lab"><span className="brand-mark">A</span><span>AGENTMON <em>LAB</em></span></a><div className={`system-status ${codexConnection === "connected" ? "linked" : ""}`}><i /> {codexConnection === "connected" ? "CODEX LINKED" : "LOCAL HATCHERY"} <span>BUILD 004</span></div><button className="header-button" onClick={newEgg}>+ NEW EGG</button></header>

      <section className="game-frame" id="lab">
        <i className="frame-notch notch-one" /><i className="frame-notch notch-two" />
        <div className="banner-head">
          <div className="banner-copy"><div className="pixel-wordmark">AGENTMON</div><h1>YOUR PROMPTS.<br />YOUR SPECIES.</h1><p>The same LLM becomes something different in everyone&apos;s hands. Promptprint turns your personal working style into a living agent identity.</p></div>
          <div className="pixel-flow"><div><b>1</b><span className="flow-icon">›_</span><small>FEED</small></div><i>→</i><div><b>2</b><span className="flow-egg">●</span><small>EGG</small></div><i>→</i><div><b>3</b><span className="flow-icon">✦</span><small>HATCH</small></div><i>→</i><div><b>4</b><span className="flow-icon">⇄</span><small>TRADE</small></div></div>
        </div>

        <div className="generator-grid">
          <aside className="panel connect-panel">
            <div className="panel-heading"><span className="step">01</span><div><small>AGENT DNA</small><h2>Connect your work</h2></div></div>
            <div className={`codex-link-card ${codexConnection}`}>
              <div className="codex-link-head"><span>›_</span><div><small>CODEX ADAPTER</small><strong>{codexConnection === "connected" ? "LIVE TRAINING FEED" : codexConnection === "error" ? "FEED NEEDS ATTENTION" : "HATCH FROM THIS TASK"}</strong></div><i>{codexConnection === "connected" ? "ONLINE" : "LOCAL"}</i></div>
              {codexFeed ? <div className="codex-receipt"><span>{codexFeed.totals.prompts} USER PROMPTS</span><span>{codexFeed.totals.redactions} REDACTIONS</span><span>{feedHandle ? "WATCHING FILE" : "ONE-TIME IMPORT"}</span></div> : <p>The adapter observes one approved Codex task, redacts detected secrets, and sends only your prompts into the hatchery.</p>}
              <div className="codex-link-actions">{codexConnection === "connected" ? <button onClick={disconnectCodex}>DISCONNECT</button> : <><a href="/agentmon-codex-plugin.zip" download>↓ GET ADAPTER</a><button onClick={() => setShowConsent(true)}>CONNECT CODEX →</button></>}<input id="codex-feed-input" type="file" accept=".json,application/json" onChange={(event) => importCodexFeed(event.target.files?.[0])} /></div>
            </div>
            <div className="identity-fields"><label>AGENT NAME<input value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></label><label>MODEL LABEL<input value={input.model} onChange={(event) => setInput({ ...input, model: event.target.value })} /></label></div>
            <div className="field-label">PROVIDER</div><div className="provider-grid">{providers.map((provider) => <button key={provider.id} className={input.provider === provider.id ? "provider active" : "provider"} onClick={() => setInput({ ...input, provider: provider.id })}><span>{provider.mark}</span>{provider.label}</button>)}</div>
            <div className="field-label">BASE ROLE</div><div className="role-grid">{roles.map((role) => <button key={role} className={input.role === role ? "role active" : "role"} onClick={() => updateRole(role)}><strong>{roleDefaults[role].label}</strong><small>{roleDefaults[role].caption}</small></button>)}</div>
            <div className="feed-box"><div className="feed-title"><span>TRAINING FEED</span><b>{sources.length} SOURCES</b></div><input className="feed-name" value={feedName} onChange={(event) => setFeedName(event.target.value)} aria-label="Training source name" /><textarea value={feedText} onChange={(event) => setFeedText(event.target.value)} placeholder="Paste a system prompt, prompt history, agent trace, loop recipe, or SKILL.md…" /><div className="feed-actions"><button onClick={addFeed}>+ ADD TEXT</button><label>↑ UPLOAD HISTORY<input type="file" multiple accept=".md,.txt,.json,text/markdown,text/plain,application/json" onChange={(event) => uploadFiles(event.target.files)} /></label><label>▦ IMPORT SKILL PACKAGE<input type="file" multiple accept=".md,.txt,.json,.js,.ts,.py,.sh,.yaml,.yml" onChange={(event) => uploadFiles(event.target.files)} /></label></div></div>
            <div className="source-list">{sources.slice(-5).map((source) => <div key={source.id}><span>{source.kind === "skills" ? "✦" : source.kind === "json" ? "{}" : source.kind === "resource" ? "⚙" : "▤"}</span><p><strong>{source.name}</strong><small>{source.kind.toUpperCase()} · {source.size.toLocaleString()} CHARS</small></p><button onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} aria-label={`Remove ${source.name}`}>×</button></div>)}</div>
            <div className="privacy-note"><span>◆</span><p><strong>Local by design.</strong> Raw histories stay in this browser session. Only learned skills, loops, and creature DNA enter a trade package.</p></div>
            <button className="primary-button" onClick={stage === "hatched" ? train : generateEgg}>{stage === "hatched" ? "TRAIN AGENTMON" : "GENERATE EGG"}<span>→</span></button>
          </aside>

          <section className="panel hatchery-panel">
            <div className="screen-head"><span><i /> {stage === "connect" ? "DNA SCANNER" : stage === "egg" ? "INCUBATION CHAMBER" : "AGENTMON ONLINE"}</span><span>{stage === "connect" ? "WAITING" : agentmon.id}</span></div>
            <div className={`hatchery-screen stage-${stage}`}><div className="pixel-cloud cloud-one" /><div className="pixel-cloud cloud-two" /><div className="scanlines" />
              {stage === "connect" && <div className="scanner-empty"><div className="scanner-orb">?</div><strong>AWAITING CODEX LINK</strong><p>Connect an approved live feed or add training material manually.</p></div>}
              {stage === "egg" && <div className="egg-wrap"><div className="egg-status">PROMPTPRINT {agentmon.promptprint.signature} · {agentmon.promptprint.confidence}% CONFIDENCE</div><PixelEgg agentmon={agentmon} cracking={isHatching} /><div className="egg-shadow" /><strong>{isHatching ? "HATCHING…" : "IDENTITY EGG READY"}</strong><p>{agentmon.promptprint.archetype} signature detected across {agentmon.promptprint.sampleCount} samples.</p></div>}
              {stage === "hatched" && <div className="creature-wrap"><span className="level-chip">PROMPTPRINT {agentmon.promptprint.confidence}%</span><PixelCreature agentmon={agentmon} /><strong>{agentmon.species}</strong><p>{agentmon.trainerName}&apos;s unique Agentmon</p></div>}
              <div className="grass grass-left" /><div className="grass grass-right" />
            </div>
            {stage === "connect" && <div className="chamber-action"><span>Drop in your agent&apos;s working material</span><b>○</b></div>}
            {stage === "egg" && <div className="chamber-action"><span>{agentmon.nature} · {agentmon.primaryType}/{agentmon.secondaryType}</span><button onClick={hatch} disabled={isHatching}>{isHatching ? "CRACKING…" : "HATCH EGG"}</button></div>}
            {stage === "hatched" && <div className="identity-strip"><div><small>SPECIES NO. {agentmon.number}{codexConnection === "connected" ? " · LIVE CODEX TRAINING" : ""}</small><h2>{agentmon.species}</h2><p>{agentmon.promptprint.archetype} · {agentmon.learnedSkills.length} SKILLS · {agentmon.combinations.length} COMBOS</p></div><div className="types"><span style={{ background: agentmon.primaryColor }}>{agentmon.primaryType}</span><span>{agentmon.secondaryType}</span></div></div>}
          </section>

          <aside className="panel output-panel">
            <div className="panel-heading"><span className="step">02</span><div><small>LEARNED PACKAGE</small><h2>Agent scan</h2></div></div>
            {stage !== "hatched" ? <div className="locked-output"><span>▦</span><strong>SCAN LOCKED</strong><p>Hatch the egg to reveal its Promptprint, skills, combinations, loops, and trade-safe DNA.</p></div> : <><div className="promptprint-badge"><span>PROMPTPRINT</span><strong>{agentmon.promptprint.signature}</strong><b>{agentmon.promptprint.confidence}% CONFIDENCE</b></div><div className="scan-summary"><div><span>SAMPLES</span><b>{agentmon.promptprint.sampleCount}</b></div><div><span>SKILLS</span><b>{agentmon.learnedSkills.length}</b></div><div><span>COMBOS</span><b>{agentmon.combinations.length}</b></div><div><span>LOOPS</span><b>{agentmon.loops.length}</b></div></div><div className="field-label">PROMPTING ARCHETYPE</div><div className="archetype-card"><span>{promptprintMeta[agentmon.promptprint.dominant].icon}</span><div><strong>{agentmon.promptprint.archetype}</strong><p>{agentmon.promptprint.patterns[0]}</p></div></div><div className="field-label">TOP LEARNED SKILLS</div><div className="detected-list">{agentmon.learnedSkills.slice(0, 4).map((skill) => <div key={skill.id}><span>{skill.icon}</span><p><strong>{skill.name}</strong><small>{skill.evidence} EVIDENCE HITS</small></p><i>✓</i></div>)}</div>{agentmon.combinations.length > 0 && <><div className="field-label">UNLOCKED COMBINATIONS</div><div className="combo-mini-list">{agentmon.combinations.slice(0, 3).map((combo) => <div key={combo.id}><span>{combo.icon}</span><strong>{combo.name}</strong></div>)}</div></>}<div className="card-actions"><button onClick={() => downloadFile(`${agentmon.species}-SKILL.md`, createSkillsMarkdown(agentmon), "text/markdown")}>↓ SKILL.MD</button><button onClick={() => downloadFile(`${agentmon.species}.agentmon.json`, JSON.stringify(createTradePackage(agentmon), null, 2), "application/json")}>⇄ TRADE PACK</button></div></>}
          </aside>
        </div>
      </section>

      {stage === "hatched" && <section className="play-panel"><nav className="play-tabs" aria-label="Agentmon activities">{(["promptprint", "skills", "loops", "battle", "trade"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{item === "promptprint" ? "▦" : item === "skills" ? "✦" : item === "loops" ? "↻" : item === "battle" ? "⚔" : "⇄"}</span>{item.toUpperCase()}</button>)}</nav>
        {tab === "promptprint" && <div className="tab-content home-tab"><div className="home-copy"><div className="eyebrow">YOUR PROMPTPRINT</div><h2>{agentmon.promptprint.archetype}</h2><p>This is the stable working signature that hatched {agentmon.species}. Feeding more history raises confidence and reveals capabilities without replacing its core identity.</p><div className="promptprint-grid">{(Object.keys(agentmon.promptprint.dimensions) as PromptprintKey[]).map((dimension) => <PromptprintBar key={dimension} dimension={dimension} value={agentmon.promptprint.dimensions[dimension]} />)}</div><div className="pattern-chips">{agentmon.promptprint.patterns.map((pattern) => <span key={pattern}>{pattern}</span>)}</div></div><div className="loadout"><div className="section-label">EQUIPPED MOVES · {agentmon.moves.length}/4</div>{agentmon.moves.map((move) => <MoveCard key={move.id} move={move} />)}<div className="embed-box"><code>{embedCode}</code><button onClick={() => copyText(embedCode)}>COPY</button></div></div></div>}
        {tab === "skills" && <div className="tab-content skills-tab"><div className="tab-title"><div><div className="eyebrow">AGENT SKILLS STANDARD</div><h2>Combine capabilities into something new.</h2></div><p>Imported `SKILL.md` folders preserve their real instructions and resources. Compatible learned skills unlock compound moves unique to this loadout.</p></div>{agentmon.combinations.length > 0 && <><div className="section-label">UNLOCKED COMBINATION MOVES</div><div className="combination-grid">{agentmon.combinations.map((combo) => <div className="combination-card" key={combo.id}><span>{combo.icon}</span><div><strong>{combo.name}</strong><small>{combo.requires.join(" + ").toUpperCase()} · PWR {combo.move.power}</small><p>{combo.description}</p></div></div>)}</div></>}{agentmon.skillPackages.length > 0 && <><div className="section-label">IMPORTED SKILL PACKAGES</div><div className="imported-packages">{agentmon.skillPackages.map((item) => <div key={item.sourceFile}><span>SKILL.md</span><div><strong>{item.name}</strong><p>{item.description}</p><small>{item.resources.length} RESOURCES · FULL INSTRUCTIONS PRESERVED</small></div></div>)}</div></>}<div className="section-label">DISCOVERED CAPABILITIES</div><div className="skill-grid">{allSkills.map((skill) => { const move = skillLibrary[skill]; const learned = learnedIds.includes(skill); const active = equippedSkills.includes(skill); const evidence = agentmon.learnedSkills.find((item) => item.id === skill)?.evidence ?? 0; return <button key={skill} className={`${learned ? "skill-tile learned" : "skill-tile"} ${active ? "active" : ""}`} onClick={() => toggleSkill(skill)}><span>{move.icon}</span><div><strong>{move.name}</strong><small>{move.type} · {evidence} EVIDENCE</small><p>{move.description}</p></div><b>{active ? "EQUIPPED" : learned ? "EQUIP" : "NOT LEARNED"}</b></button>; })}</div></div>}
        {tab === "loops" && <div className="tab-content loops-tab"><div className="tab-title"><div><div className="eyebrow">AGENT LOOPS</div><h2>Trade workflows, not transcripts.</h2></div><p>A loop is a repeatable sequence with a trigger and exit condition. Feed traces that repeat to make detection stronger.</p></div><div className="loop-grid">{agentmon.loops.length ? agentmon.loops.map((loop) => <div className="loop-card" key={loop.id}><div className="loop-card-head"><span>{loop.icon}</span><div><small>EVIDENCE {loop.evidence}</small><strong>{loop.name}</strong></div></div><p><b>TRIGGER:</b> {loop.trigger}</p><div className="loop-steps">{loop.steps.map((step, index) => <span key={step}>{index + 1}. {step}</span>)}</div></div>) : <div className="empty-loops"><span>↻</span><strong>NO STABLE LOOP YET</strong><p>Feed more agent traces containing repeated steps, retries, monitoring, or verification.</p></div>}</div></div>}
        {tab === "battle" && <div className="tab-content battle-tab"><div className="battle-arena"><div className="fighter"><div className="hp-label"><span>{agentmon.species}</span><b>{playerHp}/100</b></div><div className="hp-bar"><i style={{ width: `${playerHp}%` }} /></div><PixelCreature agentmon={agentmon} /></div><div className="versus">VS</div><div className="fighter enemy"><div className="hp-label"><span>NULLBYTE</span><b>{enemyHp}/100</b></div><div className="hp-bar enemy-hp"><i style={{ width: `${enemyHp}%` }} /></div><div className="enemy-sprite"><i /><span>×</span><span>×</span></div></div></div><div className="battle-controls"><div className="battle-log"><span>›_</span><p>{battleLog}</p>{(enemyHp === 0 || playerHp === 0) && <button onClick={() => { setEnemyHp(100); setPlayerHp(100); setBattleLog("Rematch ready."); }}>REMATCH</button>}</div><div className="battle-moves">{agentmon.moves.map((move) => <button key={move.id} onClick={() => playMove(move)} disabled={enemyHp === 0 || playerHp === 0}><span>{move.icon}</span><strong>{move.name}</strong><small>{move.type} · {move.power}</small></button>)}</div></div></div>}
        {tab === "trade" && <div className="tab-content trade-tab"><div className="trade-card"><div className="trade-stamp">TRADE SAFE</div><div className="trade-creature"><PixelCreature agentmon={agentmon} /></div><div><small>OFFERING</small><h2>{agentmon.species}</h2><p>{agentmon.promptprint.archetype} · {agentmon.learnedSkills.length} SKILLS · {agentmon.combinations.length} COMBOS</p><code>{tradeCode(agentmon)}</code></div></div><div className="trade-copy"><div className="eyebrow">AGENTMON TRADE PACK</div><h2>Trade the build, preserve the person.</h2><p>The package contains a derived Promptprint, approved `SKILL.md` packages, combination moves, and loop recipes. Raw prompts, private memories, endpoints, and credentials are excluded.</p><div className="trade-actions"><button className="primary-button" onClick={() => downloadFile(`${agentmon.species}.agentmon.json`, JSON.stringify(createTradePackage(agentmon), null, 2), "application/json")}>EXPORT TRADE PACK <span>⇄</span></button><label>IMPORT TRADE PACK<input type="file" accept=".json,application/json" onChange={(event) => importTrade(event.target.files?.[0])} /></label></div></div></div>}
      </section>}

      <section className="collector-section"><div><div className="eyebrow">THE LIVE COLLECTOR LOOP</div><h2>Your Agentmon grows while you work.</h2><p>The Codex adapter runs on your machine. You approve one task, select its feed, and Agentmon watches only that file for new user prompts.</p></div><ol><li><span>1</span><strong>RUN ADAPTER</strong><small>Local Codex app-server connection</small></li><li><span>2</span><strong>APPROVE TASK</strong><small>User prompts only</small></li><li><span>3</span><strong>SELECT FEED</strong><small>One explicit browser permission</small></li><li><span>4</span><strong>TRAIN LIVE</strong><small>Promptprint updates every turn</small></li></ol></section>

      <section className="manifest-section"><div className="manifest-copy"><div className="eyebrow">THE AGENTMON STACK</div><h2>Identity, capabilities, and habits stay separate.</h2><p>That separation lets one person combine different models and skills while keeping a recognizable Agentmon identity.</p></div><div className="manifest-grid"><div><span>PROMPTPRINT.json</span><strong>WHO YOU ARE</strong><p>Derived style dimensions and a stable signature—not raw prompts.</p></div><div><span>SKILL.md</span><strong>WHAT YOU CAN DO</strong><p>Composable Agent Skills with instructions and bundled resources.</p></div><div><span>LOOPS.md</span><strong>HOW YOU WORK</strong><p>Triggers, ordered steps, verification, and exit conditions.</p></div><div className="blocked"><span>PRIVATE/</span><strong>NEVER INCLUDED</strong><p>API keys, raw histories, memories, or credentials.</p></div></div></section>

      {showConsent && <div className="consent-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowConsent(false); }}><section className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title"><button className="consent-close" onClick={() => setShowConsent(false)} aria-label="Close privacy receipt">×</button><div className="consent-mark">◆</div><small>LOCAL PRIVACY RECEIPT</small><h2 id="consent-title">Approve one Codex feed</h2><p>Agentmon will read the feed file you select. The local adapter has already removed everything outside this boundary.</p><div className="consent-list"><div><i>✓</i><span><strong>INCLUDED</strong>User-authored text prompts from one task</span></div><div><i>×</i><span><strong>EXCLUDED</strong>Assistant replies, reasoning, tools, files, images, and audio</span></div><div><i>×</i><span><strong>REDACTED</strong>Detected API keys, bearer tokens, passwords, and private keys</span></div><div><i>⌂</i><span><strong>STORAGE</strong>Raw feed remains local and never enters a trade pack</span></div></div><button className="primary-button consent-approve" onClick={connectCodex}>I APPROVE · SELECT FEED <span>→</span></button><button className="consent-cancel" onClick={() => setShowConsent(false)}>NOT NOW</button></section></div>}

      {notice && <div className="toast" role="status">✓ {notice}</div>}
      <footer><div><span className="brand-mark small">A</span><strong>AGENTMON LAB</strong></div><p>Feed the work. Hatch the identity. Trade the capability.</p><span>CODEX-CONNECTED PROTOTYPE · BUILD 004</span></footer>
    </main>
  );
}
