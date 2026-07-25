"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AgentInput,
  type Agentmon,
  type Move,
  type ProviderKey,
  type RoleKey,
  type SkillKey,
  type TradePackage,
  type TrainingSource,
  type TraitKey,
  createAgentInput,
  createSkillsMarkdown,
  createTradePackage,
  equipSkills,
  generateAgentmon,
  roleDefaults,
  skillLibrary,
  tradeCode,
  trainAgentmon,
  traitMeta,
} from "./agentmon-engine";

type Stage = "connect" | "egg" | "hatched";
type Tab = "home" | "skills" | "loops" | "battle" | "trade";

const providers: Array<{ id: ProviderKey; label: string; mark: string }> = [
  { id: "openai", label: "OpenAI", mark: "◎" }, { id: "anthropic", label: "Anthropic", mark: "A" }, { id: "google", label: "Google", mark: "G" }, { id: "local", label: "Local", mark: "⌂" }, { id: "custom", label: "Custom", mark: "+" },
];
const roles = Object.keys(roleDefaults) as RoleKey[];
const allSkills = Object.keys(skillLibrary) as SkillKey[];

function StatBar({ trait, value }: { trait: TraitKey; value: number }) {
  const meta = traitMeta[trait];
  return <div className="stat-row"><div className="stat-label"><span>{meta.icon} {meta.label}</span><b>{value}</b></div><div className="stat-track"><i style={{ width: `${value}%`, background: meta.color }} /></div></div>;
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
  const [tab, setTab] = useState<Tab>("home");
  const [isHatching, setIsHatching] = useState(false);
  const [notice, setNotice] = useState("");
  const [enemyHp, setEnemyHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [battleLog, setBattleLog] = useState("Choose a learned move to begin the training battle.");

  useEffect(() => {
    const saved = window.localStorage.getItem("agentmon:creature:v1");
    if (!saved) return;
    try { const restored = JSON.parse(saved) as Agentmon; if (restored.id && restored.learnedSkills) { setAgentmon({ ...restored, skillPackages: restored.skillPackages ?? [], loops: restored.loops ?? [] }); setStage("hatched"); } } catch { window.localStorage.removeItem("agentmon:creature:v1"); }
  }, []);

  useEffect(() => {
    if (stage === "hatched") window.localStorage.setItem("agentmon:creature:v1", JSON.stringify(agentmon));
  }, [agentmon, stage]);

  const equippedSkills = useMemo(() => agentmon.moves.map((move) => move.id), [agentmon.moves]);
  const learnedIds = useMemo(() => agentmon.learnedSkills.map((skill) => skill.id), [agentmon.learnedSkills]);

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 1800); }
  function updateRole(role: RoleKey) { setInput((current) => ({ ...current, role, skills: [...roleDefaults[role].skills] })); }

  function makeSource(name: string, content: string, kind: TrainingSource["kind"]): TrainingSource {
    return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, kind, content, size: content.length };
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
    setAgentmon(generateAgentmon(input, pending)); setStage("egg"); setTab("home");
  }

  function hatch() { setIsHatching(true); window.setTimeout(() => { setIsHatching(false); setStage("hatched"); }, 1100); }

  function train() {
    const pending = feedText.trim() ? [...sources, makeSource(feedName, feedText.trim(), "history")] : sources;
    if (pending !== sources) { setSources(pending); setFeedText(""); }
    setAgentmon((current) => trainAgentmon(current, input, pending)); flash("Skills and loops updated");
  }

  function newEgg() { setStage("connect"); setTab("home"); setSources([]); setFeedText(""); setEnemyHp(100); setPlayerHp(100); window.localStorage.removeItem("agentmon:creature:v1"); }

  function toggleSkill(skill: SkillKey) {
    if (!learnedIds.includes(skill)) { flash("Feed evidence to learn this skill first"); return; }
    const next = equippedSkills.includes(skill) ? equippedSkills.filter((item) => item !== skill) : [...equippedSkills, skill].slice(-4);
    setAgentmon((current) => equipSkills(current, next));
  }

  function useMove(move: Move) {
    if (enemyHp <= 0 || playerHp <= 0) return;
    const damage = Math.round(move.power / 3.2); const nextEnemy = Math.max(0, enemyHp - damage); const counter = nextEnemy === 0 ? 0 : 12 + agentmon.variant;
    setEnemyHp(nextEnemy); setPlayerHp(Math.max(0, playerHp - counter)); setBattleLog(nextEnemy === 0 ? `${agentmon.species} wins with ${move.name}!` : `${move.name} dealt ${damage}. Nullbyte countered for ${counter}.`);
  }

  async function copyText(value: string) { await navigator.clipboard.writeText(value); flash("Copied to clipboard"); }

  async function importTrade(file: File | undefined) {
    if (!file) return;
    try { const packet = JSON.parse(await file.text()) as TradePackage; if (packet.format !== "agentmon.trade/v1" || !packet.creature?.id) throw new Error("Invalid package"); setAgentmon({ ...packet.creature, skillPackages: packet.creature.skillPackages ?? [], loops: packet.creature.loops ?? [], trainedAt: new Date().toISOString() }); setStage("hatched"); setTab("home"); flash("Traded Agentmon imported"); } catch { flash("That is not a valid Agentmon trade package"); }
  }

  const embedCode = `<Agentmon agent="${agentmon.id}" skills={[${agentmon.moves.map((move) => `"${move.id}"`).join(", ")}]} />`;

  return (
    <main className="app-shell">
      <header className="topbar"><a className="brand" href="#lab"><span className="brand-mark">A</span><span>AGENTMON <em>LAB</em></span></a><div className="system-status"><i /> LOCAL HATCHERY <span>BUILD 003</span></div><button className="header-button" onClick={newEgg}>+ NEW EGG</button></header>

      <section className="game-frame" id="lab">
        <i className="frame-notch notch-one" /><i className="frame-notch notch-two" />
        <div className="banner-head">
          <div className="banner-copy"><div className="pixel-wordmark">AGENTMON</div><h1>FEED. HATCH.<br />LEARN. TRADE.</h1><p>Turn the way your LLM actually works into a living, portable agent companion.</p></div>
          <div className="pixel-flow"><div><b>1</b><span className="flow-icon">›_</span><small>FEED</small></div><i>→</i><div><b>2</b><span className="flow-egg">●</span><small>EGG</small></div><i>→</i><div><b>3</b><span className="flow-icon">✦</span><small>HATCH</small></div><i>→</i><div><b>4</b><span className="flow-icon">⇄</span><small>TRADE</small></div></div>
        </div>

        <div className="generator-grid">
          <aside className="panel connect-panel">
            <div className="panel-heading"><span className="step">01</span><div><small>AGENT DNA</small><h2>Feed your LLM</h2></div></div>
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
              {stage === "connect" && <div className="scanner-empty"><div className="scanner-orb">?</div><strong>AWAITING AGENT DATA</strong><p>Feed a prompt, history, trace, or skills file to start.</p></div>}
              {stage === "egg" && <div className="egg-wrap"><div className="egg-status">DNA {agentmon.dna} · {agentmon.sourceCount} SOURCES READ</div><PixelEgg agentmon={agentmon} cracking={isHatching} /><div className="egg-shadow" /><strong>{isHatching ? "HATCHING…" : "AGENT EGG READY"}</strong><p>{agentmon.learnedSkills.length} skills detected in its initial DNA.</p></div>}
              {stage === "hatched" && <div className="creature-wrap"><span className="level-chip">TRAINED ON {agentmon.sourceCount} SOURCES</span><PixelCreature agentmon={agentmon} /><strong>{agentmon.species}</strong><p>{agentmon.trainerName}&apos;s Agentmon</p></div>}
              <div className="grass grass-left" /><div className="grass grass-right" />
            </div>
            {stage === "connect" && <div className="chamber-action"><span>Drop in your agent&apos;s working material</span><b>○</b></div>}
            {stage === "egg" && <div className="chamber-action"><span>{agentmon.nature} · {agentmon.primaryType}/{agentmon.secondaryType}</span><button onClick={hatch} disabled={isHatching}>{isHatching ? "CRACKING…" : "HATCH EGG"}</button></div>}
            {stage === "hatched" && <div className="identity-strip"><div><small>SPECIES NO. {agentmon.number}</small><h2>{agentmon.species}</h2><p>{agentmon.nature} · {agentmon.learnedSkills.length} SKILLS · {agentmon.loops.length} LOOPS</p></div><div className="types"><span style={{ background: agentmon.primaryColor }}>{agentmon.primaryType}</span><span>{agentmon.secondaryType}</span></div></div>}
          </section>

          <aside className="panel output-panel">
            <div className="panel-heading"><span className="step">02</span><div><small>LEARNED PACKAGE</small><h2>Agent scan</h2></div></div>
            {stage !== "hatched" ? <div className="locked-output"><span>▦</span><strong>SCAN LOCKED</strong><p>Hatch the egg to reveal detected skills, loops, traits, and trade-safe DNA.</p></div> : <><div className="scan-summary"><div><span>SOURCES</span><b>{agentmon.sourceCount}</b></div><div><span>SKILLS</span><b>{agentmon.learnedSkills.length}</b></div><div><span>PACKAGES</span><b>{agentmon.skillPackages.length}</b></div><div><span>LOOPS</span><b>{agentmon.loops.length}</b></div></div><div className="field-label">TOP LEARNED SKILLS</div><div className="detected-list">{agentmon.learnedSkills.slice(0, 5).map((skill) => <div key={skill.id}><span>{skill.icon}</span><p><strong>{skill.name}</strong><small>{skill.evidence} EVIDENCE HITS</small></p><i>✓</i></div>)}</div>{agentmon.skillPackages.length > 0 && <><div className="field-label">AGENT SKILL PACKAGES</div><div className="package-mini-list">{agentmon.skillPackages.map((item) => <div key={item.sourceFile}><span>SKILL.md</span><p><strong>{item.name}</strong><small>{item.resources.length} BUNDLED RESOURCES</small></p></div>)}</div></>}<div className="field-label">DETECTED LOOPS</div><div className="loop-mini-list">{agentmon.loops.length ? agentmon.loops.map((loop) => <div key={loop.id}><span>{loop.icon}</span><strong>{loop.name}</strong></div>) : <p>Feed more repeated workflows to discover loops.</p>}</div><div className="card-actions"><button onClick={() => downloadFile(`${agentmon.species}-SKILL.md`, createSkillsMarkdown(agentmon), "text/markdown")}>↓ SKILL.MD</button><button onClick={() => downloadFile(`${agentmon.species}.agentmon.json`, JSON.stringify(createTradePackage(agentmon), null, 2), "application/json")}>⇄ TRADE PACK</button></div></>}
          </aside>
        </div>
      </section>

      {stage === "hatched" && <section className="play-panel"><nav className="play-tabs" aria-label="Agentmon activities">{(["home", "skills", "loops", "battle", "trade"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{item === "home" ? "⌂" : item === "skills" ? "✦" : item === "loops" ? "↻" : item === "battle" ? "⚔" : "⇄"}</span>{item.toUpperCase()}</button>)}</nav>
        {tab === "home" && <div className="tab-content home-tab"><div className="home-copy"><div className="eyebrow">PORTABLE AGENT IDENTITY</div><h2>{agentmon.species} learned how {input.name} works.</h2><p>Its species remains stable. Feeding more history updates skills, loops, evidence, and the four-move battle loadout.</p><div className="trait-grid">{(Object.keys(agentmon.traits) as TraitKey[]).map((trait) => <StatBar key={trait} trait={trait} value={agentmon.traits[trait]} />)}</div></div><div className="loadout"><div className="section-label">EQUIPPED MOVES · {agentmon.moves.length}/4</div>{agentmon.moves.map((move) => <MoveCard key={move.id} move={move} />)}<div className="embed-box"><code>{embedCode}</code><button onClick={() => copyText(embedCode)}>COPY</button></div></div></div>}
        {tab === "skills" && <div className="tab-content skills-tab"><div className="tab-title"><div><div className="eyebrow">AGENT SKILLS STANDARD</div><h2>Progressive disclosure, packaged for play.</h2></div><p>Imported `SKILL.md` folders keep YAML discovery metadata, full operational instructions, and bundled resources. Moves are only their game representation.</p></div>{agentmon.skillPackages.length > 0 && <div className="imported-packages">{agentmon.skillPackages.map((item) => <div key={item.sourceFile}><span>SKILL.md</span><div><strong>{item.name}</strong><p>{item.description}</p><small>{item.resources.length} RESOURCES · FULL INSTRUCTIONS PRESERVED</small></div></div>)}</div>}<div className="section-label">DISCOVERED BATTLE CAPABILITIES</div><div className="skill-grid">{allSkills.map((skill) => { const move = skillLibrary[skill]; const learned = learnedIds.includes(skill); const active = equippedSkills.includes(skill); const evidence = agentmon.learnedSkills.find((item) => item.id === skill)?.evidence ?? 0; return <button key={skill} className={`${learned ? "skill-tile learned" : "skill-tile"} ${active ? "active" : ""}`} onClick={() => toggleSkill(skill)}><span>{move.icon}</span><div><strong>{move.name}</strong><small>{move.type} · {evidence} EVIDENCE</small><p>{move.description}</p></div><b>{active ? "EQUIPPED" : learned ? "EQUIP" : "NOT LEARNED"}</b></button>; })}</div></div>}
        {tab === "loops" && <div className="tab-content loops-tab"><div className="tab-title"><div><div className="eyebrow">AGENT LOOPS</div><h2>Trade workflows, not transcripts.</h2></div><p>A loop is a repeatable sequence with a trigger and exit condition. Feed traces that repeat to make detection stronger.</p></div><div className="loop-grid">{agentmon.loops.length ? agentmon.loops.map((loop) => <div className="loop-card" key={loop.id}><div className="loop-card-head"><span>{loop.icon}</span><div><small>EVIDENCE {loop.evidence}</small><strong>{loop.name}</strong></div></div><p><b>TRIGGER:</b> {loop.trigger}</p><div className="loop-steps">{loop.steps.map((step, index) => <span key={step}>{index + 1}. {step}</span>)}</div></div>) : <div className="empty-loops"><span>↻</span><strong>NO STABLE LOOP YET</strong><p>Feed more agent traces containing repeated steps, retries, monitoring, or verification.</p></div>}</div></div>}
        {tab === "battle" && <div className="tab-content battle-tab"><div className="battle-arena"><div className="fighter"><div className="hp-label"><span>{agentmon.species}</span><b>{playerHp}/100</b></div><div className="hp-bar"><i style={{ width: `${playerHp}%` }} /></div><PixelCreature agentmon={agentmon} /></div><div className="versus">VS</div><div className="fighter enemy"><div className="hp-label"><span>NULLBYTE</span><b>{enemyHp}/100</b></div><div className="hp-bar enemy-hp"><i style={{ width: `${enemyHp}%` }} /></div><div className="enemy-sprite"><i /><span>×</span><span>×</span></div></div></div><div className="battle-controls"><div className="battle-log"><span>›_</span><p>{battleLog}</p>{(enemyHp === 0 || playerHp === 0) && <button onClick={() => { setEnemyHp(100); setPlayerHp(100); setBattleLog("Rematch ready."); }}>REMATCH</button>}</div><div className="battle-moves">{agentmon.moves.map((move) => <button key={move.id} onClick={() => useMove(move)} disabled={enemyHp === 0 || playerHp === 0}><span>{move.icon}</span><strong>{move.name}</strong><small>{move.type} · {move.power}</small></button>)}</div></div></div>}
        {tab === "trade" && <div className="tab-content trade-tab"><div className="trade-card"><div className="trade-stamp">TRADE SAFE</div><div className="trade-creature"><PixelCreature agentmon={agentmon} /></div><div><small>OFFERING</small><h2>{agentmon.species}</h2><p>{agentmon.learnedSkills.length} SKILLS · {agentmon.loops.length} LOOPS</p><code>{tradeCode(agentmon)}</code></div></div><div className="trade-copy"><div className="eyebrow">AGENTMON TRADE PACK</div><h2>Skills and loops travel. Secrets do not.</h2><p>The package contains creature DNA, `SKILLS.md` data, and loop recipes. Raw prompts, private memories, endpoints, and credentials are excluded.</p><div className="trade-actions"><button className="primary-button" onClick={() => downloadFile(`${agentmon.species}.agentmon.json`, JSON.stringify(createTradePackage(agentmon), null, 2), "application/json")}>EXPORT TRADE PACK <span>⇄</span></button><label>IMPORT TRADE PACK<input type="file" accept=".json,application/json" onChange={(event) => importTrade(event.target.files?.[0])} /></label></div></div></div>}
      </section>}

      <section className="manifest-section"><div className="manifest-copy"><div className="eyebrow">WHAT GETS TRADED</div><h2>An Agentmon is a safe, portable manifest.</h2><p>It captures the useful structure of an agent without copying the private material that taught it.</p></div><div className="manifest-grid"><div><span>DNA.json</span><strong>IDENTITY</strong><p>Species seed, traits, nature, and cosmetic genome.</p></div><div><span>SKILLS.md</span><strong>CAPABILITIES</strong><p>Learned skill descriptions, evidence, types, and power.</p></div><div><span>LOOPS.md</span><strong>WORKFLOWS</strong><p>Triggers, ordered steps, and loop exit conditions.</p></div><div className="blocked"><span>PRIVATE/</span><strong>NEVER INCLUDED</strong><p>API keys, raw histories, memories, or credentials.</p></div></div></section>

      {notice && <div className="toast" role="status">✓ {notice}</div>}
      <footer><div><span className="brand-mark small">A</span><strong>AGENTMON LAB</strong></div><p>Feed the work. Hatch the identity. Trade the capability.</p><span>PRIVATE PROTOTYPE · BUILD 003</span></footer>
    </main>
  );
}
