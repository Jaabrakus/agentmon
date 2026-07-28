# Agentmon Creation Engine V4

Version 0.23 adds verified learning and evolution transitions. A trainer-signed request binds the certified parent, exact child, ownership head, independent transition counter, and authority learning attestation. The registry atomically consumes the parent root, records the new certificate, and cancels stale listings. Learning cannot rewrite identity or existing procedures; evolution must exactly reproduce the deterministic engine result. See [VERIFIED_ECONOMY.md](./VERIFIED_ECONOMY.md).

Version 0.22 adds an explicit **Agentmon Mode** toggle to the Chrome popup. It applies only to the active tab, displays the active Agentmon and last selected skill, and clears the downlink when disabled. The typed `/agentmon auto <slot>` shortcut remains available. The downlink router now requires a real semantic match before confidence or outcome history can boost a skill, supports bounded scope/exclusion policies, and reports a raw-free `procedure-match` or `identity-only` audit.

Version 0.21 makes the closed loop deployable. `/agentmon auto <slot>` explicitly enables submit-time context routing to proven, non-regressed procedures without retaining the submitted text. A versioned model-target manifest connects loopback OpenAI-compatible models and the authenticated Codex CLI to the same portability suite; examples are disabled by default, credentials are forbidden in manifests, and local adapters must remain on loopback. See [ENGINE_V4.md](./ENGINE_V4.md).

Version 0.20 adds the closed usefulness loop. Proven procedures can receive raw-free trainer outcomes, accumulate an effectiveness score, and automatically leave every downlink when real usage shows regression. A permission-aware context router selects relevant Agentmons without retaining the task. An optional loopback model sees only raw-free evidence counts and may select bounded workflow primitives; deterministic compilation, trainer confirmation, arena proof, and structural verification remain mandatory. Portability matrices and approval-only squad plans provide the next multi-model and multi-Agentmon foundations. See [ENGINE_V4.md](./ENGINE_V4.md).

Version 0.19 adds the verified economy boundary. Canonical Agentmons accept procedures only from learned engine recipes; trainer-authored procedure injection is disabled. Immutable procedure hashes and automatic arena provenance feed a canonical state root. Generated runtime artifacts carry integrity digests, while a development Ed25519 authority issues state/listing certificates and finalizes transfers with monotonic sequences and replay protection. Local mods remain possible, but they are labeled `modded` and cannot receive an official listing. See [VERIFIED_ECONOMY.md](./VERIFIED_ECONOMY.md).

The authority can run as an authenticated loopback service with `npm run agentmon:economy-server`. Production should move the same registry transaction boundary and signing key to a separately secured server.

Visual Engine V4 now uses a local, quality-gated trait species model. `trait-founders-v4` contains ninety-six independently authored species across six visual biomes—Founders Core, Tidal Forge, Riftwild, the impossible-fauna Mythweave Wilds, the four-affinity Elemental Conflux, and the function-driven robot fauna of Circuitwild Commons—each with a matching egg, three authored evolution forms, and eight visible trait axes: body, eyes, sensors, locomotion, appendages, core, material, and palette. That is 288 authored creature silhouettes and 1,152 selectable form/morph appearances. Every species pair must differ on at least five axes; every eye system is distinct. The roadmap target is 256 authored species, and recolors or evolution forms do not inflate that number. Permanent DNA deterministically produces standard (85%), regional (10%), rare (4%), or mythic (1%) expression plus individual genes. New hatches begin at Form I; lineage generations may permanently advance to Form II and Form III. Every base sprite is normalized automatically through Sprite Fusion Pixel Snapper with a 1–10 gauge; level 4 (2px/160 colors) is the texture-preserving default and level 7 matches the earlier 3px/96-color treatment. The primitive 64px renderer remains only behind `agentmon:legacy-gallery` for migration diagnostics.

The Pixel Snapper subprocess is local and fail-closed: reviewed source and binary hashes are pinned, networking is denied, `/Users` and `/Volumes` are inaccessible inside its macOS sandbox, inherited environment secrets are stripped, and only a staged temporary sprite is supplied.

Version 0.18 adds the opt-in Agentmon Local browser extension for ChatGPT, Claude, Gemini, Kimi, and Venice. Browser prompts use strict `derived-only` retention: exact submitted text exists only in transient memory, is discarded after analysis, and is never written to the vault, SQLite, browser storage, or a cloud service. The local `/agentmon use <slot>` and `/agentmon off` commands provide an explicit per-conversation downlink containing only trainer-approved, raw-free procedures. The desktop app shows enabled sites, intake counts, current form, behavioral stats, arena proof counts, and active downlink state. Version 0.17's private companion and Version 0.16's 64px phenotype pipeline remain the runtime and visual foundations. See [CONNECTORS.md](./CONNECTORS.md) and [MODULAR_ARCHITECTURE.md](./MODULAR_ARCHITECTURE.md).

Generate a deterministic local curated egg and creature PNG:

```bash
npm run agentmon:visual -- --slot main
npm run agentmon:gallery
npm run agentmon:app-sprites
```

Artifacts remain under `.agentmon/roster/<slot>/visual/`. Visual equipment is derived only from trainer-confirmed, arena-proven procedures.

The retired Phenotype V2 combinator exposes billions of raw permutations, but that count is no longer a product metric. Visual V4 currently ships ninety-six real species whose eye and anatomy profiles are visibly distinct. New species must be authored, reviewed at game scale, given a matching egg and complete trait metadata, and shipped through a versioned local pack. See [VISUAL_ENGINE_V4.md](./VISUAL_ENGINE_V4.md).

The adapter turns submitted prompts from one approved Codex task into a continuously trained local Agentmon. Creation Engine V4 adapts the poker trainer's limited-information discipline: it records what was knowable when a prompt was classified, lets the trainer correct intent, tracks evidence for and against behavior hypotheses, tests permission-aware procedures against a baseline model, and measures raw-free real-world usefulness separately. The intake boundary remains user-authored text prompts only.

Agentmon is no longer coupled to Codex. `agentmon.adapter-batch/v1` lets an IDE, desktop app, CLI, agent framework, or robot bridge submit authorized user events to an authenticated loopback daemon. An optional OpenAI-compatible local model runs only in shadow mode. See [LOCAL_RUNTIME.md](./LOCAL_RUNTIME.md).

```bash
npm run agentmon:doctor
npm run agentmon:daemon
```

New hatches receive a deterministic NameForge name instead of choosing from a tiny species list. Preview raw-free, cross-linguistic sound blends without changing the current Mon, then explicitly adopt one while preserving DNA:

```bash
npm run agentmon -- names --slot main --count 12
npm run agentmon -- reforge-name --slot main --candidate 2
```

NameForge combines synthetic phonotactic components rather than copying words from a language. It stores the contributing sound packs, templates, syllables, and seed digest as provenance. V1 uses a portable ASCII display skeleton for safe ownership identifiers; the data adapter for full PHOIBLE/Glottolog coverage remains a separate, versioned dataset layer.

## Start

From the project whose Codex task you want to connect:

```bash
npm run agentmon -- watch
```

The command keeps an approved feed open and writes the derived Agentmon, Promptprint, `SKILL.md`, and open learning ledger under `.agentmon/roster/main/`. Durable state and signed derived events live in `.agentmon/agentmon.db`. It retrains only when a newly submitted prompt changes the feed.

Use `npm run agentmon -- creation`, `skills`, `squad`, `inspect`, or `export` to inspect the system without exposing prompt text. Pass `--slot architect` or another slot name to maintain multiple Agentmons under one project.

For live browser training, start the companion and load `browser-extension/` as an unpacked Chrome extension. Pair it with the one-time code printed in the terminal, then explicitly enable the current supported site. Prompt Mode is limited to approved LLM sites and observes submit, send-button, and Enter events only—never input events, drafts, model responses, or other tabs.

Action Learning is a second, separate opt-in. It records only a finite semantic taxonomy (site hostname, route digest, page class, action kind, control class, time, risk, and reversibility). It excludes page text, field values, selectors, paths, URLs, screenshots, keystrokes, credentials, and inferred emotions. The trainer may declare a temporary emotion plus 1–5 intensity; that individual Agentmon's hatch-locked resonance interprets the state through the Stakes Engine, and repeated workflows are exported locally to `.agentmon/roster/<slot>/action-skills/SKILL.md` after at least three distinct sessions.

Turn on **Agentmon Mode** in the Chrome popup to route each later submit in that tab to the best matching proven procedure. The `/agentmon auto <slot>` and `/agentmon auto off` shortcuts do the same thing. After a routed task, type `/agentmon helped` or `/agentmon missed` to record whether the active proven procedure helped. Only a task digest and derived outcome metadata are stored. Assistant responses are never captured, and trainer feedback cannot award arena proof.

## Calibrate and prove a procedure

```bash
npm run agentmon -- correct-intent --source latest --intent product-spec
npm run agentmon -- review-procedure --procedure tool-assisted-build --review confirmed
npm run agentmon -- arena-record --procedure tool-assisted-build --variant baseline --quality pass --outcome failure
npm run agentmon -- arena-record --procedure tool-assisted-build --variant agentmon --quality pass --outcome success
npm run agentmon -- arena
```

Intent corrections are stored as raw-free calibration records and retrain the current feed. Procedures are generated only from repeated learned behavior; manual procedure authoring is intentionally unavailable to canonical Agentmons. Manual arena grades are annotations only and never award proof. Later success or failure is recorded separately, so a lucky mistake does not become a learned skill and a sound unlucky decision is not discarded.

Run the automatic matched arena against an installed OpenAI-compatible local model:

```bash
npm run agentmon -- arena-validate --suite plugins/agentmon-codex/arena/engineering-foundations.json
export AGENTMON_ARENA_MODEL="your-installed-model"
npm run agentmon -- arena-run --suite plugins/agentmon-codex/arena/engineering-foundations.json --procedure tool-assisted-build --model "$AGENTMON_ARENA_MODEL"
```

The harness locks the suite, procedure, model configuration, seed, and budget; randomizes execution and judge order; and compares baseline versus Agentmon scores. A suite with `genericControl` runs a third, strong generic-advice arm so improvement from prompting can be separated from personalization. Add `--judge-model MODEL` for blinded model grading. Full prompts and outputs stay in a private local artifact while SQLite receives only raw-free metrics and digests. See [AUTOMATIC_ARENA.md](./AUTOMATIC_ARENA.md).

Use `--provider codex` to run the same harness through authenticated, ephemeral, read-only Codex CLI sessions when no local model runtime is installed. This path is appropriate for explicit evaluations, not an always-on background loop, because it can consume substantial model time and tokens.

For credible trainer-specific evidence, start a prospective private collection window instead of reusing a checked-in gym:

```bash
npm run agentmon -- proof-start --procedure core-proof-loop --target 12 --minimum 10
npm run agentmon -- proof-add --file .agentmon/my-new-task.json
npm run agentmon -- proof-status
```

The protocol freezes the confirmed procedure and training cutoff, stores task text only in mode-`0600` ignored files, screens new tasks against pre-cutoff training and development material, and refuses to call fewer than ten independent tasks runnable. See [PROSPECTIVE_PROOF.md](./PROSPECTIVE_PROOF.md).

## Deploy into another LLM

```bash
npm run agentmon -- deploy --slot main
```

The output contains `SKILL.md`, `SYSTEM_PROMPT.md`, `agentmon.json`, and `manifest.json`. A skill-aware host can install the folder as a skill; a generic LLM app can prepend the system prompt. Only trainer-confirmed, arena-proven procedures become executable guidance, and the host must still supply their declared tools and permissions. Unreviewed, rejected, untested, testing, and regressed procedures remain visible as developing evidence but are not deployed. The pack does not contain raw prompts, private keys, credentials, or hidden reasoning.

Check the canonical state and generated files before use or trade:

```bash
npm run agentmon -- verify --slot main
```

Read-only file modes prevent accidents; signed roots and digest verification enforce official-economy eligibility.

## Offline database and quests

Initialize SQLite and migrate an existing JSON roster without deleting its compatibility files:

```bash
npm run agentmon -- db-init
npm run agentmon -- db-status
```

The database stores normalized Agentmons, prompt observations, decision episodes, behavior hypotheses, staged skill candidates, procedural skills, arena trials and raw-free automatic arena summaries, skill branches, ownership records, consent grants, squads, quests, missions, assignments, runs, artifacts, permissions, and an append-only event/outbox stream. Event payloads contain derived evidence rather than raw prompt text. When a trainer identity exists, event envelopes are signed with its Ed25519 key so they can later be synchronized to an authoritative service.

Create the first offline squad quest:

```bash
npm run agentmon -- quest-create --title "Ship Agentmon" --objective "Plan, build, test, and review the next product milestone."
npm run agentmon -- quests
```

SQLite is the device store; future Supabase/Postgres sync consumes the stable event envelopes instead of uploading the SQLite file. Ownership and DNA conflicts must eventually be resolved by the authoritative cloud transaction layer, never last-write-wins.

## Trade lineage

A signed trade transfers the whole canonical Agentmon—not merely one skill. Package v3 includes identity, genome, Promptprint, capabilities, procedure branches, raw-free proof history, lineage, and ownership, with an independent digest for every section. Private prompt observations, decision episodes, credentials, keys, and skill-package bodies remain local.

Create one local Ed25519 identity per trainer project and exchange public fingerprints:

```bash
npm run agentmon -- identity --name "Trainer Alpha"
npm run agentmon -- transfer --slot main --to RECIPIENT_FINGERPRINT --out guardot.agentmon-transfer.json
```

Issuing transfer certificate v2 freezes retraining, deployment, evolution, and another transfer for that creature. Certificates extend a monotonic ownership sequence and expire after seven days. The current owner may cancel a pending local transfer:

```bash
npm run agentmon -- transfer-cancel --slot main --certificate CERTIFICATE_ID
```

The recipient creates their identity and accepts the targeted certificate:

```bash
npm run agentmon -- identity --name "Trainer Beta"
npm run agentmon -- accept --file guardot.agentmon-transfer.json --slot successor
npm run agentmon -- registry
```

Private keys remain under `.agentmon/identity/` and are never packaged. Acceptance verifies the Ed25519 signature, SHA-256 payload, sender ownership record, creature lineage, and recipient fingerprint.

`export`/`import` remains available for portable copies and testing:

```bash
npm run agentmon -- export --slot main --out guardot.agentmon.json
npm run agentmon -- import --file guardot.agentmon.json --slot successor --name "Trainer Beta"
npm run agentmon -- train --slot successor --feed .agentmon/feeds/successor.json
npm run agentmon -- skills --slot successor
npm run agentmon -- evolve --slot successor
npm run agentmon -- lineage --slot successor
```

Portable packages use a SHA-256 integrity receipt and a whole-creature section manifest. Signed transfers additionally prove authorization to one recipient, parent ownership head, sequence, expiry, and complete manifest digest. A receiving trainer creates a separate acquired branch. Cross-trainer fusion moves become eligible for explicit, irreversible evolution only after verified ownership acceptance.

## Privacy

The browser adapter observes only messages the trainer submits on an explicitly enabled origin, not global keystrokes or drafts. It excludes assistant messages, system/developer instructions, reasoning, tools, command output, files, images, and audio. Its raw text is transient and never persisted. Explicit native/import connectors retain sanitized raw feeds only in the encrypted local vault because replay was requested for those workflows; they never upload them. Ledgers, SQLite, browser storage, deployments, and trade packages never include raw prompt text. Imported skill contents are never executed automatically.
