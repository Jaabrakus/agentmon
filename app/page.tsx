"use client";

import { useMemo, useState } from "react";
import {
  type AgentInput,
  type Agentmon,
  type Move,
  type ProviderKey,
  type RoleKey,
  type SkillKey,
  type TraitKey,
  createAgentInput,
  equipSkills,
  generateAgentmon,
  roleDefaults,
  skillLibrary,
  tradeCode,
  traitMeta,
} from "./agentmon-engine";

type Stage = "connect" | "egg" | "hatched";
type Tab = "home" | "skills" | "battle" | "trade";

const providers: Array<{ id: ProviderKey; label: string; mark: string }> = [
  { id: "openai", label: "OpenAI", mark: "◎" },
  { id: "anthropic", label: "Anthropic", mark: "A" },
  { id: "google", label: "Google", mark: "G" },
  { id: "local", label: "Local", mark: "⌂" },
  { id: "custom", label: "Custom", mark: "+" },
];

const roles = Object.keys(roleDefaults) as RoleKey[];
const allSkills = Object.keys(skillLibrary) as SkillKey[];

function StatBar({ trait, value }: { trait: TraitKey; value: number }) {
  const meta = traitMeta[trait];
  return (
    <div className="stat-row">
      <div className="stat-label"><span>{meta.icon} {meta.label}</span><b>{value}</b></div>
      <div className="stat-track"><i style={{ width: `${value}%`, background: meta.color }} /></div>
    </div>
  );
}

function PixelEgg({ agentmon, cracking = false }: { agentmon: Agentmon; cracking?: boolean }) {
  return (
    <div className={`pixel-egg egg-${agentmon.variant} ${cracking ? "cracking" : ""}`} style={{ "--egg-color": agentmon.primaryColor, "--egg-accent": agentmon.accentColor } as React.CSSProperties} role="img" aria-label={`${agentmon.primaryType} Agentmon egg`}>
      <i className="egg-spot spot-one" /><i className="egg-spot spot-two" /><i className="egg-spot spot-three" />
      <span className="egg-crack">⌁</span>
    </div>
  );
}

function PixelCreature({ agentmon, hit = false }: { agentmon: Agentmon; hit?: boolean }) {
  return (
    <div className={`creature variant-${agentmon.variant} ${hit ? "take-hit" : ""}`} style={{ "--creature": agentmon.primaryColor, "--accent": agentmon.accentColor } as React.CSSProperties} role="img" aria-label={`${agentmon.species}, a ${agentmon.primaryType} Agentmon`}>
      <div className="creature-shadow" />
      <div className="tail"><i /></div>
      <div className="ear ear-left" /><div className="ear ear-right" />
      <div className="antenna"><i /></div>
      <div className="creature-body">
        <div className="face"><i className="eye eye-left" /><i className="eye eye-right" /><i className="mouth" /></div>
        <div className="core">{agentmon.coreGlyph}</div>
        <div className="foot foot-left" /><div className="foot foot-right" />
      </div>
    </div>
  );
}

function MoveCard({ move, compact = false }: { move: Move; compact?: boolean }) {
  return (
    <div className={`move-card ${compact ? "compact" : ""}`}>
      <span className="move-icon">{move.icon}</span>
      <div><strong>{move.name}</strong><small>{move.type} · PWR {move.power}</small>{!compact && <p>{move.description}</p>}</div>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState<AgentInput>(() => createAgentInput());
  const [agentmon, setAgentmon] = useState<Agentmon>(() => generateAgentmon(createAgentInput()));
  const [stage, setStage] = useState<Stage>("connect");
  const [tab, setTab] = useState<Tab>("home");
  const [isHatching, setIsHatching] = useState(false);
  const [copied, setCopied] = useState("");
  const [enemyHp, setEnemyHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [battleLog, setBattleLog] = useState("Choose a move to begin the training battle.");
  const [enemyHit, setEnemyHit] = useState(false);

  const equippedSkills = useMemo(() => agentmon.moves.map((move) => move.id), [agentmon.moves]);

  function updateRole(role: RoleKey) {
    setInput((current) => ({ ...current, role, skills: [...roleDefaults[role].skills] }));
  }

  function generateEgg() {
    const next = generateAgentmon(input);
    setAgentmon(next);
    setStage("egg");
    setTab("home");
  }

  function hatch() {
    setIsHatching(true);
    window.setTimeout(() => {
      setIsHatching(false);
      setStage("hatched");
    }, 1150);
  }

  function resetGenerator() {
    setStage("connect");
    setTab("home");
    setEnemyHp(100);
    setPlayerHp(100);
  }

  function toggleSkill(skill: SkillKey) {
    const current = equippedSkills;
    const next = current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill];
    const limited = next.slice(-4);
    setAgentmon((value) => equipSkills(value, limited));
  }

  function useMove(move: Move) {
    if (enemyHp <= 0 || playerHp <= 0) return;
    const damage = Math.round(move.power / 3.2);
    const nextEnemy = Math.max(0, enemyHp - damage);
    const counter = nextEnemy === 0 ? 0 : 11 + (agentmon.variant * 2);
    const nextPlayer = Math.max(0, playerHp - counter);
    setEnemyHp(nextEnemy);
    setPlayerHp(nextPlayer);
    setEnemyHit(true);
    window.setTimeout(() => setEnemyHit(false), 320);
    setBattleLog(nextEnemy === 0 ? `${agentmon.species} wins with ${move.name}!` : `${move.name} dealt ${damage}. Nullbyte countered for ${counter}.`);
  }

  function resetBattle() {
    setEnemyHp(100); setPlayerHp(100); setBattleLog("Training arena reset. Choose your opening move.");
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function exportAgentmon() {
    const file = new Blob([JSON.stringify(agentmon, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${agentmon.species.toLowerCase()}-${agentmon.dna.toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const embedCode = `<Agentmon agent="${agentmon.id}" skills={[${agentmon.moves.map((move) => `"${move.id}"`).join(", ")}]} />`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">A</span><span>AGENTMON <em>LAB</em></span></a>
        <div className="system-status"><i /> HATCHERY ONLINE <span>BUILD 002</span></div>
        <button className="header-button" onClick={resetGenerator}>+ NEW EGG</button>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">LLM → EGG → AGENTMON</div>
        <h1>Plug in your agent.<br /><span>Hatch its alter ego.</span></h1>
        <p>Your model, mission, and equipped skills generate a one-of-one digital creature you can train, battle, trade, or embed in any AI app.</p>
        <div className="journey-line" aria-label="Agentmon creation steps">
          {(["connect", "egg", "hatched"] as Stage[]).map((item, index) => (
            <div key={item} className={stage === item || (["connect", "egg", "hatched"].indexOf(stage) > index) ? "journey active" : "journey"}>
              <b>0{index + 1}</b><span>{item === "connect" ? "CONNECT LLM" : item === "egg" ? "GENERATE EGG" : "MEET AGENTMON"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="generator-grid">
        <aside className="panel connect-panel">
          <div className="panel-heading"><span className="step">01</span><div><small>AGENT DNA</small><h2>Connect your LLM</h2></div></div>

          <label className="field-label" htmlFor="agent-name">AGENT NAME</label>
          <input className="text-input" id="agent-name" value={input.name} maxLength={18} onChange={(event) => setInput({ ...input, name: event.target.value })} />

          <div className="field-label">PROVIDER</div>
          <div className="provider-grid">
            {providers.map((provider) => <button key={provider.id} className={input.provider === provider.id ? "provider active" : "provider"} onClick={() => setInput({ ...input, provider: provider.id })}><span>{provider.mark}</span>{provider.label}</button>)}
          </div>

          <label className="field-label" htmlFor="model-name">MODEL / ENDPOINT LABEL</label>
          <input className="text-input" id="model-name" value={input.model} onChange={(event) => setInput({ ...input, model: event.target.value })} />

          <div className="field-label">AGENT ROLE</div>
          <div className="role-grid">
            {roles.map((role) => <button key={role} className={input.role === role ? "role active" : "role"} onClick={() => updateRole(role)}><strong>{roleDefaults[role].label}</strong><small>{roleDefaults[role].caption}</small></button>)}
          </div>

          <label className="field-label" htmlFor="mission">WHAT DOES IT DO?</label>
          <textarea id="mission" className="mission-input" value={input.mission} maxLength={180} onChange={(event) => setInput({ ...input, mission: event.target.value })} />
          <div className="privacy-note"><span>◆</span><p><strong>No secret keys required here.</strong> Your host app keeps provider credentials; Agentmon reads only the profile and skill manifest.</p></div>
          <button className="primary-button" onClick={generateEgg}>GENERATE MY EGG <span>→</span></button>
        </aside>

        <section className="panel hatchery-panel">
          <div className="screen-head"><span><i /> {stage === "connect" ? "DNA SCANNER" : stage === "egg" ? "INCUBATION CHAMBER" : "AGENTMON ONLINE"}</span><span>{stage === "connect" ? "READY" : agentmon.id}</span></div>
          <div className={`hatchery-screen stage-${stage}`}>
            <div className="pixel-cloud cloud-one" /><div className="pixel-cloud cloud-two" /><div className="scanlines" />
            {stage === "connect" && <div className="scanner-empty"><div className="scanner-orb">?</div><strong>NO EGG YET</strong><p>Complete the agent profile and start the DNA scan.</p></div>}
            {stage === "egg" && <div className="egg-wrap"><div className="egg-status">DNA {agentmon.dna} · {agentmon.primaryType}/{agentmon.secondaryType}</div><PixelEgg agentmon={agentmon} cracking={isHatching} /><div className="egg-shadow" /><strong>{isHatching ? "HATCHING…" : "YOUR EGG IS READY"}</strong><p>Its pattern was generated from your agent&apos;s identity.</p></div>}
            {stage === "hatched" && <div className="creature-wrap"><span className="level-chip">HATCHED</span><PixelCreature agentmon={agentmon} /><strong>{agentmon.species}</strong><p>{agentmon.trainerName}&apos;s Agentmon</p></div>}
            <div className="grass grass-left" /><div className="grass grass-right" />
          </div>
          {stage === "connect" && <div className="chamber-action"><span>Waiting for agent DNA…</span><b>○</b></div>}
          {stage === "egg" && <div className="chamber-action"><span>{agentmon.nature} potential detected</span><button onClick={hatch} disabled={isHatching}>{isHatching ? "CRACKING…" : "HATCH EGG"}</button></div>}
          {stage === "hatched" && <div className="identity-strip"><div><small>SPECIES NO. {agentmon.number}</small><h2>{agentmon.species}</h2><p>{agentmon.nature} nature</p></div><div className="types"><span style={{ background: agentmon.primaryColor }}>{agentmon.primaryType}</span><span>{agentmon.secondaryType}</span></div></div>}
        </section>

        <aside className="panel output-panel">
          <div className="panel-heading"><span className="step">02</span><div><small>LIVE PREVIEW</small><h2>Agentmon card</h2></div></div>
          {stage !== "hatched" ? (
            <div className="locked-output"><span>▦</span><strong>CARD LOCKED</strong><p>Hatch your egg to reveal species, nature, traits, and moves.</p></div>
          ) : (
            <>
              <div className="mini-card">
                <div className="mini-card-top"><span>{agentmon.trainerName}</span><b>#{agentmon.number}</b></div>
                <div className="mini-creature"><PixelCreature agentmon={agentmon} /></div>
                <div className="mini-info"><strong>{agentmon.species}</strong><span>{agentmon.primaryType} / {agentmon.secondaryType}</span><p>{agentmon.natureCopy}</p></div>
              </div>
              <div className="card-actions"><button onClick={exportAgentmon}>↓ EXPORT JSON</button><button onClick={() => copyText(embedCode, "embed")}>{copied === "embed" ? "✓ COPIED" : "⧉ COPY COMPONENT"}</button></div>
              <div className="dna-row"><span>AGENTMON ID</span><code>{agentmon.id}</code></div>
            </>
          )}
        </aside>
      </section>

      {stage === "hatched" && (
        <section className="play-panel">
          <nav className="play-tabs" aria-label="Agentmon activities">
            {(["home", "skills", "battle", "trade"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{item === "home" ? "⌂" : item === "skills" ? "✦" : item === "battle" ? "⚔" : "⇄"}</span>{item.toUpperCase()}</button>)}
          </nav>

          {tab === "home" && <div className="tab-content home-tab"><div className="home-copy"><div className="eyebrow">YOUR NEW COMPANION</div><h2>{agentmon.species} is ready to work.</h2><p>The species came from the stable agent profile. Skills become equipable moves, so its loadout can grow without changing who it is.</p><div className="trait-grid">{(Object.keys(agentmon.traits) as TraitKey[]).map((trait) => <StatBar key={trait} trait={trait} value={agentmon.traits[trait]} />)}</div></div><div className="loadout"><div className="section-label">CURRENT LOADOUT · {agentmon.moves.length}/4</div>{agentmon.moves.map((move) => <MoveCard key={move.id} move={move} />)}<div className="embed-box"><code>{embedCode}</code><button onClick={() => copyText(embedCode, "home")}>{copied === "home" ? "COPIED" : "COPY"}</button></div></div></div>}

          {tab === "skills" && <div className="tab-content skills-tab"><div className="tab-title"><div><div className="eyebrow">SKILL LIBRARY</div><h2>Skills become battle moves.</h2></div><p>Teach up to four. Connected tools, MCPs, and agent skills can map into this same move manifest later.</p></div><div className="skill-grid">{allSkills.map((skill) => { const move = skillLibrary[skill]; const active = equippedSkills.includes(skill); return <button key={skill} className={active ? "skill-tile active" : "skill-tile"} onClick={() => toggleSkill(skill)}><span>{move.icon}</span><div><strong>{move.name}</strong><small>{move.type} · POWER {move.power}</small><p>{move.description}</p></div><b>{active ? "EQUIPPED" : "TEACH"}</b></button>; })}</div></div>}

          {tab === "battle" && <div className="tab-content battle-tab"><div className="battle-arena"><div className="fighter player"><div className="hp-label"><span>{agentmon.species}</span><b>{playerHp}/100</b></div><div className="hp-bar"><i style={{ width: `${playerHp}%` }} /></div><PixelCreature agentmon={agentmon} /></div><div className="versus">VS</div><div className={`fighter enemy ${enemyHit ? "hit" : ""}`}><div className="hp-label"><span>NULLBYTE</span><b>{enemyHp}/100</b></div><div className="hp-bar enemy-hp"><i style={{ width: `${enemyHp}%` }} /></div><div className="enemy-sprite"><i /><span>×</span><span>×</span></div></div></div><div className="battle-controls"><div className="battle-log"><span>›_</span><p>{battleLog}</p>{(enemyHp === 0 || playerHp === 0) && <button onClick={resetBattle}>REMATCH</button>}</div><div className="battle-moves">{agentmon.moves.map((move) => <button key={move.id} onClick={() => useMove(move)} disabled={enemyHp === 0 || playerHp === 0}><span>{move.icon}</span><strong>{move.name}</strong><small>{move.type} · {move.power}</small></button>)}</div></div></div>}

          {tab === "trade" && <div className="tab-content trade-tab"><div className="trade-card"><div className="trade-stamp">TRADE PASS</div><div className="trade-creature"><PixelCreature agentmon={agentmon} /></div><div><small>OFFERING</small><h2>{agentmon.species}</h2><p>{agentmon.primaryType} / {agentmon.secondaryType} · {agentmon.nature}</p><code>{tradeCode(agentmon)}</code></div></div><div className="trade-copy"><div className="eyebrow">PEER-TO-PEER TRADING</div><h2>Send the creature, not the credentials.</h2><p>A trade package contains the Agentmon identity, cosmetic DNA, and skill manifest. It never contains model API keys, private prompts, or agent memory.</p><button className="primary-button" onClick={() => copyText(tradeCode(agentmon), "trade")}>{copied === "trade" ? "TRADE CODE COPIED ✓" : "COPY TRADE CODE"}<span>⇄</span></button><small>Prototype mode · no ownership transfer occurs yet</small></div></div>}
        </section>
      )}

      <section className="loop-section">
        <div><span>01</span><strong>PLUG IN</strong><p>Connect any hosted or local LLM profile.</p></div><b>→</b><div><span>02</span><strong>HATCH</strong><p>Stable agent DNA generates its egg and species.</p></div><b>→</b><div><span>03</span><strong>LEARN</strong><p>Skills, tools, and MCPs become moves.</p></div><b>→</b><div><span>04</span><strong>PLAY</strong><p>Battle, trade, and embed your companion.</p></div>
      </section>

      <footer><div><span className="brand-mark small">A</span><strong>AGENTMON LAB</strong></div><p>One agent. One egg. One original companion.</p><span>PRIVATE PROTOTYPE · BUILD 002</span></footer>
    </main>
  );
}
