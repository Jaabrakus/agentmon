"use client";

import { useMemo, useState } from "react";
import {
  type AgentEvent,
  type AgentState,
  type TraitKey,
  createAgent,
  deriveIdentity,
  processEvent,
  traitMeta,
} from "./agentmon-engine";

const quickEvents: Array<{ event: AgentEvent; icon: string; label: string }> = [
  { event: "task_solved", icon: "★", label: "Task solved" },
  { event: "tool_used", icon: "⌘", label: "Tool used" },
  { event: "smart_question", icon: "?", label: "Asked well" },
  { event: "verified", icon: "✓", label: "Verified work" },
  { event: "helped_user", icon: "♥", label: "Helped user" },
  { event: "hallucinated", icon: "!", label: "Missed fact" },
];

const profiles = [
  { id: "coder", label: "Coding agent", glyph: "</>" },
  { id: "researcher", label: "Research agent", glyph: "⌕" },
  { id: "companion", label: "Companion", glyph: "☺" },
] as const;

function StatBar({ trait, value }: { trait: TraitKey; value: number }) {
  const meta = traitMeta[trait];
  return (
    <div className="stat-row">
      <div className="stat-label">
        <span>{meta.icon} {meta.label}</span>
        <span>{value}</span>
      </div>
      <div className="stat-track" aria-label={`${meta.label}: ${value} out of 100`}>
        <div className="stat-fill" style={{ width: `${value}%`, background: meta.color }} />
      </div>
    </div>
  );
}

function PixelCreature({ type, mood }: { type: string; mood: string }) {
  return (
    <div className={`creature creature-${type.toLowerCase()} mood-${mood}`} aria-label={`${type} type Agentmon creature`} role="img">
      <div className="creature-shadow" />
      <div className="tail"><i /></div>
      <div className="ear ear-left" />
      <div className="ear ear-right" />
      <div className="antenna"><i /></div>
      <div className="creature-body">
        <div className="face">
          <i className="eye eye-left" />
          <i className="eye eye-right" />
          <i className="mouth" />
        </div>
        <div className="core">✦</div>
        <div className="foot foot-left" />
        <div className="foot foot-right" />
      </div>
    </div>
  );
}

export default function Home() {
  const [profile, setProfile] = useState<(typeof profiles)[number]["id"]>("coder");
  const [modelName, setModelName] = useState("Nova");
  const [agent, setAgent] = useState<AgentState>(() => createAgent("coder"));
  const [eventLog, setEventLog] = useState<Array<{ id: number; text: string; tone: string }>>([
    { id: 1, text: "Agent connected. Baseline traits loaded.", tone: "neutral" },
    { id: 2, text: "Waiting for observable behavior…", tone: "dim" },
  ]);
  const [pulse, setPulse] = useState(0);

  const identity = useMemo(() => deriveIdentity(agent), [agent]);

  function hatchAgent() {
    setAgent(createAgent(profile));
    setEventLog([
      { id: Date.now(), text: `${modelName || "New agent"} hatched as ${deriveIdentity(createAgent(profile)).species}.`, tone: "good" },
      { id: Date.now() + 1, text: "Trait confidence starts low. Train with real events.", tone: "dim" },
    ]);
    setPulse((value) => value + 1);
  }

  function applyEvent(event: AgentEvent) {
    const result = processEvent(agent, event);
    setAgent(result.state);
    setPulse((value) => value + 1);
    setEventLog((current) => [
      { id: Date.now(), text: result.message, tone: event === "hallucinated" ? "bad" : "good" },
      ...current,
    ].slice(0, 5));
  }

  const progress = Math.min(100, Math.round((agent.xp / identity.nextEvolutionXp) * 100));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Agentmon Lab home">
          <span className="brand-mark">A</span>
          <span>AGENTMON <em>LAB</em></span>
        </a>
        <div className="system-status"><i /> ENGINE ONLINE <span>v0.1</span></div>
        <button className="icon-button" aria-label="Open settings">⚙</button>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">BEHAVIOR → TRAITS → CREATURE</div>
        <h1>Every agent leaves a <span>digital footprint.</span><br />We turn it into a companion.</h1>
        <p>Connect an AI agent. Its real decisions shape an original creature that learns, develops a nature, and evolves alongside it.</p>
      </section>

      <section className="lab-grid">
        <aside className="panel scanner-panel">
          <div className="panel-heading">
            <span className="step">01</span>
            <div><small>INPUT</small><h2>Connect an agent</h2></div>
          </div>

          <label className="field-label" htmlFor="agent-name">AGENT NAME</label>
          <div className="name-input-wrap">
            <span>›_</span>
            <input id="agent-name" value={modelName} maxLength={14} onChange={(event) => setModelName(event.target.value)} />
          </div>

          <div className="field-label">AGENT ARCHETYPE</div>
          <div className="profile-list" role="radiogroup" aria-label="Agent archetype">
            {profiles.map((item) => (
              <button
                key={item.id}
                className={profile === item.id ? "profile active" : "profile"}
                onClick={() => setProfile(item.id)}
                role="radio"
                aria-checked={profile === item.id}
              >
                <span className="profile-glyph">{item.glyph}</span>
                <span>{item.label}<small>{item.id === "coder" ? "tools + precision" : item.id === "researcher" ? "curiosity + rigor" : "empathy + memory"}</small></span>
                <i>{profile === item.id ? "●" : "○"}</i>
              </button>
            ))}
          </div>

          <div className="source-note">
            <span>◆</span>
            <p><strong>Privacy-first</strong>Your app sends behavioral events, never private prompts.</p>
          </div>
          <button className="primary-button" onClick={hatchAgent}>RUN TRAIT SCAN <span>→</span></button>
        </aside>

        <section className="panel habitat-panel">
          <div className="habitat-topline">
            <div><span className="live-dot" /> LIVE COMPANION</div>
            <div>NO. {identity.number}</div>
          </div>
          <div className="habitat-screen">
            <div className="pixel-cloud cloud-one" />
            <div className="pixel-cloud cloud-two" />
            <div className="scanlines" />
            <div className="level-tag">LV. {agent.level}</div>
            <div className="mood-tag">{identity.mood === "happy" ? "♪ THRIVING" : "… RECOVERING"}</div>
            <div key={pulse} className="creature-stage pop">
              <PixelCreature type={identity.primaryType} mood={identity.mood} />
            </div>
            <div className="grass grass-left" />
            <div className="grass grass-right" />
          </div>
          <div className="identity-card">
            <div>
              <small>{modelName || "UNNAMED"}&apos;S FORM</small>
              <h2>{identity.species}</h2>
              <p>{identity.nature} nature · {identity.stageLabel}</p>
            </div>
            <div className="type-stack">
              <span style={{ background: identity.primaryColor }}>{identity.primaryType}</span>
              <span className="secondary-type">{identity.secondaryType}</span>
            </div>
          </div>
          <div className="xp-block">
            <div><span>EVOLUTION READINESS</span><strong>{progress}%</strong></div>
            <div className="xp-track"><i style={{ width: `${progress}%` }} /></div>
            <p>{agent.confidence < 64 ? `Need ${64 - agent.confidence}% more behavior confidence` : `${identity.nextEvolutionXp - agent.xp} XP until evolution gate`}</p>
          </div>
        </section>

        <aside className="panel genome-panel">
          <div className="panel-heading">
            <span className="step">02</span>
            <div><small>OUTPUT</small><h2>Trait genome</h2></div>
          </div>
          <div className="confidence-row">
            <span>MODEL CONFIDENCE</span>
            <strong>{agent.confidence}%</strong>
          </div>
          <div className="stats">
            {(Object.keys(agent.traits) as TraitKey[]).map((trait) => (
              <StatBar key={trait} trait={trait} value={agent.traits[trait]} />
            ))}
          </div>
          <div className="moves-block">
            <div className="field-label">LEARNED MOVES</div>
            <div className="moves-grid">
              {identity.moves.map((move, index) => (
                <div className="move" key={move}><span>{["✦", "⌁", "◇", "↟"][index]}</span>{move}</div>
              ))}
            </div>
          </div>
          <div className="nature-card">
            <span className="nature-icon">✺</span>
            <div><small>EMERGING NATURE</small><strong>{identity.nature}</strong><p>{identity.natureCopy}</p></div>
          </div>
        </aside>
      </section>

      <section className="engine-section">
        <div className="engine-copy">
          <div className="eyebrow">THE EVOLUTION ENGINE</div>
          <h2>Traits are earned.<br />Evolution is <span>proven.</span></h2>
          <p>A lightweight SDK listens for meaningful agent events. Each signal updates a trait score, evidence count, and confidence window. No single action can force an evolution.</p>
          <div className="engine-rules">
            <div><b>1</b><span><strong>Observe</strong>Normalized events from any agent framework</span></div>
            <div><b>2</b><span><strong>Score</strong>Weighted traits with decay and anti-spam caps</span></div>
            <div><b>3</b><span><strong>Evolve</strong>Species gates require XP, confidence, and consistency</span></div>
          </div>
        </div>
        <div className="event-console">
          <div className="console-head"><span>EVENT SIMULATOR</span><span><i /> STREAMING</span></div>
          <p>Send behavior to the engine</p>
          <div className="event-buttons">
            {quickEvents.map((item) => (
              <button key={item.event} onClick={() => applyEvent(item.event)} className={item.event === "hallucinated" ? "negative" : ""}>
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
          <div className="log-window" aria-live="polite">
            {eventLog.map((entry) => <div className={`log-line ${entry.tone}`} key={entry.id}><span>{entry.tone === "good" ? "+" : entry.tone === "bad" ? "−" : "›"}</span>{entry.text}</div>)}
          </div>
          <div className="sdk-line"><code>agentmon.track(<em>&quot;tool_used&quot;</em>, &#123; success: true &#125;)</code><button aria-label="Copy example">⧉</button></div>
        </div>
      </section>

      <footer>
        <div><span className="brand-mark small">A</span><strong>AGENTMON ENGINE</strong></div>
        <p>One creature. Every agent. An identity that grows with the work.</p>
        <span>PROTOTYPE BUILD 001</span>
      </footer>
    </main>
  );
}
