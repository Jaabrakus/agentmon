# Agentmon Lab

## Download the friend beta

Open [release-kit/latest](./release-kit/latest/) for the ready macOS Apple Silicon app, Chrome companion extension, and one-page setup guide. Windows x64 installers are built automatically by GitHub Actions and attached to the matching GitHub Release when an `agentmon-v*` tag is pushed.

The desktop app contains the Agentmon lifecycle engine and a checksum-verified Node runtime. Friends do not need this source repository, Node.js, Rust, or a developer toolchain to hatch and train a Mon.

Agentmon turns a person's prompting style, agent skills, and repeatable workflows into an original collectible creature. The game is local-first: raw prompts are training material, while trade packages contain only derived Promptprint traits and approved portable skills.

Creation Engine V3 distinguishes personal working behavior from product specifications, questions, brainstorming, and reference text. Inspired by the project's poker trainer, every classification records known facts, unknowns, and estimates; trainers can correct intent; behavior hypotheses carry evidence for and against; and procedures can be tested against a baseline LLM before being trusted.

Canonical procedures are learned by versioned engine recipes, not typed into `SKILL.md`. Procedure revisions, automatic arena evidence, DNA, archetype, and ownership form a cryptographic state root. Local edits remain possible as unofficial mods, but an Ed25519 authority will not certify or list them in the verified economy.

NameForge gives new hatches deterministic names from cross-linguistic sound patterns instead of a small fixed species list. Existing Mons keep their names until the trainer explicitly chooses a generated candidate; names may change, but DNA and learned evidence do not.

The engine now has an authenticated, loopback-only daemon and a versioned provider-neutral adapter contract. Codex is one adapter rather than the core. Other IDEs, desktop agents, API products, and robot bridges can submit explicitly authorized user events without learning Codex's storage format. An optional Ollama/llama.cpp-compatible local model may propose shadow classifications, but cannot change skills, DNA, or arena results.

```bash
npm run agentmon:doctor
npm run agentmon:daemon
```

## Codex-connected vertical slice

The included Agentmon Codex adapter reads one approved task through the official Codex app-server interface. It observes only submitted, sanitized user-authored prompts and continuously hatches or trains an Agentmon from that feed.

```bash
npm install
npm run agentmon:codex
```

Start the local open-box learning loop:

```bash
npm run agentmon -- watch
```

Derived compatibility artifacts are written under `.agentmon/roster/main/`: the creature, Promptprint, portable `SKILL.md`, and a learning ledger containing provenance and evidence counts without raw prompt text. Durable offline state lives in `.agentmon/agentmon.db`. Use `--slot NAME` to run multiple Agentmons under one project, then inspect them with `npm run agentmon -- squad`.

Inspect creation evidence and export a generic LLM runtime pack:

```bash
npm run agentmon -- creation --slot main
npm run agentmon -- names --slot main --count 12
npm run agentmon -- correct-intent --source latest --intent product-spec
npm run agentmon -- arena --slot main
npm run agentmon -- deploy --slot main
npm run agentmon -- verify --slot main
```

Run the automatic matched arena against an installed loopback OpenAI-compatible model:

```bash
npm run agentmon -- arena-validate --suite plugins/agentmon-codex/arena/engineering-foundations.json
npm run agentmon -- arena-run --suite plugins/agentmon-codex/arena/engineering-foundations.json --procedure tool-assisted-build --model LOCAL_MODEL
```

It locks the model and experiment configuration, runs baseline versus procedure-guided pairs, blinds optional judging, and keeps full outputs in a private local artifact. Suites can add a strong generic-control arm to test personalization instead of generic prompt augmentation. SQLite receives scores and digests, not benchmark prompts or outputs.

Start a credible post-cutoff personalization collection window with `proof-start`, enroll naturally occurring private tasks with `proof-add`, and inspect raw-free progress with `proof-status`. The target is 12 independent tasks; fewer than 10 cannot run as proof.

The runtime pack works with skill-aware agents through `SKILL.md` and with ordinary chat/API LLMs through `SYSTEM_PROMPT.md`. Only trainer-confirmed, arena-proven procedures are executable; the host must also expose the tools and permissions those procedures require.

Initialize or migrate the offline database and create a squad quest:

```bash
npm run agentmon -- db-init
npm run agentmon -- db-status
npm run agentmon -- quest-create --title "Build Agentmon Squads" --objective "Coordinate specialized Agentmons to plan, build, test, and review one product objective."
npm run agentmon -- quests
```

SQLite stores Agentmon snapshots, decision episodes, behavior hypotheses, manual and automatic procedure arena evidence, skill branches, signed append-only events, squads, quests, missions, assignments, runs, artifacts, permissions, ownership records, and a future cloud-sync outbox. Raw prompts remain in the consent-scoped local feed and are not copied into event envelopes. A future Supabase/Postgres service will consume those envelopes; it will not receive the SQLite file itself.

Trade and lineage are CLI-first:

```bash
npm run agentmon -- identity --name "Trainer Alpha"
npm run agentmon -- transfer --slot main --to RECIPIENT_FINGERPRINT --out guardot.agentmon-transfer.json
npm run agentmon -- transfer-cancel --slot main --certificate CERTIFICATE_ID
npm run agentmon -- accept --file guardot.agentmon-transfer.json --slot successor
npm run agentmon -- train --slot successor --feed .agentmon/feeds/successor.json
npm run agentmon -- evolve --slot successor
npm run agentmon -- lineage --slot successor
npm run agentmon -- registry
```

The official development-economy path is `authority-init`, `authority-certify`, `economy-list`, then `economy-transfer`. After the Agentmon learns or evolves, `economy-transition --kind learning|evolution` advances the verified root through a trainer-signed, authority-approved transition. It uses a separate monotonic transition sequence, consumes each parent once, and cancels listings for stale states. See [VERIFIED_ECONOMY.md](./plugins/agentmon-codex/VERIFIED_ECONOMY.md).

The receiver verifies a recipient-targeted Ed25519 whole-Agentmon certificate, inherits the complete raw-free creature and skill tree, grows a separate acquired branch, and unlocks fusion moves. The v3 package independently digests identity, genome, Promptprint, capabilities, procedures, proof, lineage, and ownership. Pending transfers freeze mutation and duplicate issuance. Evolution is explicit and irreversible: genesis DNA remains in the lineage while current DNA advances to a new generation. Ordinary `export`/`import` packages are portable copies and cannot evolve after a trainer change.

The collector excludes assistant responses, system and developer instructions, reasoning, tools, command output, file contents, images, audio, and detected credentials. `.agentmon/` is ignored by Git.

## Development

```bash
npm run dev
npm run build
npm run test:collector
```

The Codex plugin source lives under `plugins/agentmon-codex/`.
