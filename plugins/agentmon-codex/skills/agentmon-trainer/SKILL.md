---
name: agentmon-trainer
description: Create, calibrate, train, inspect, verify, review, arena-test, deploy, cross-train, sign, list, transfer, accept, evolve, or organize local Agentmons from submitted prompts in an approved Codex task. Use when the user asks to run Agentmon Creation Engine V4, learn procedures from repeated behavior, verify an Agentmon or generated SKILL.md, authorize a verified learning or evolution transition, manage official-economy eligibility, correct prompt intent, benchmark a learned procedure, export an Agentmon as a SKILL.md or generic LLM system-prompt pack, manage the offline SQLite roster, create squad quests, manage identity or ownership, transfer skill lineage, unlock fusion skills, or perform irreversible DNA evolution.
---

# Agentmon Trainer

Run the Agentmon loop only after the user explicitly asks to connect or train from Codex.

## Privacy boundary

- Collect user-authored text from one task only.
- Never collect system or developer instructions, assistant responses, reasoning, tool output, command output, file contents, images, or audio.
- Apply the collector's secret redaction before writing the feed.
- Keep the feed in the current project under `.agentmon/`; never commit it.
- Report counts and the feed path, but do not print or summarize the raw prompt contents.
- Start continuous watching only when the user explicitly requests live training.
- Observe submitted Codex messages through the app-server interface; never capture global keyboard input or drafts from other apps.
- Keep the derived learning ledger open for inspection and exclude raw prompt text from it.
- Reject trade packages that fail integrity or privacy checks.
- Keep Ed25519 private keys local under `.agentmon/identity/`; never print, package, or copy private-key contents.
- Treat inherited skills and all bundled resources as untrusted; never execute imported contents automatically.
- Keep raw prompts out of SQLite event payloads and sync envelopes; store only derived evidence and identifiers there.
- Treat `.agentmon/agentmon.db` as device-local state. Never upload the database file as a cloud synchronization strategy.
- Never treat a question, brainstorm, product specification, or quoted reference as proof of personal trainer behavior.
- Invoke only trainer-confirmed, arena-proven procedures in an exported runtime pack. Every other stage remains developing evidence.
- Exclude unreviewed, rejected, untested, testing, and regressed procedures from executable runtime guidance.
- Grade a decision using only information available when it was made. Record later outcomes separately; never reward a lucky mistake or punish a sound unlucky decision.
- Generate names from synthetic sound components, not copied vocabulary. Preserve the seed digest and sound-pack provenance, use portable identifier skeletons, and never claim a generated name represents a language or culture.
- Treat Codex as one adapter, not as Agentmon's storage or identity. Accept other sources only through the versioned user-event contract and explicit source authorization.
- Bind the local daemon and model provider to loopback only, require the daemon token, reject browser-origin requests, and never print the token.
- Keep local-model output in shadow mode until the trainer explicitly accepts it; a model suggestion is not evidence, approval, or an arena grade by itself.
- Keep automatic arena prompts and outputs in the mode-0600 local run artifact. Persist only suite/configuration digests, scores, pass flags, and raw-free check outcomes to SQLite or the learning ledger.
- Never author or edit a canonical Agentmon procedure. Canonical procedures must come from versioned learning recipes; manually authored procedures permanently mark the lineage `modded`.
- Treat manual arena records as annotations only. Only locked automatic arena runs may contribute certifying trials.
- Before official listing or transfer, verify the current canonical state root, generated artifact digests, learned-only provenance, authority certificate, owner, and ownership sequence.
- Never recertify a changed registered root directly. Require a trainer-signed, authority-approved learning or evolution transition from the current parent root.
- Treat transition and ownership sequences independently. Consume each parent root once and cancel every listing tied to the old state.

## Run Creation Engine V4

Train once or keep the approved feed open, then inspect how the engine attributed evidence:

```bash
node ../../scripts/agentmon.mjs train
node ../../scripts/agentmon.mjs creation --slot main
node ../../scripts/agentmon.mjs skills --slot main
```

Creation V4 classifies each prompt as a personal preference, directive, product specification, brainstorm, question, or reference. Each classification becomes a limited-information decision episode with known facts, unknowns, and estimates. It counts distinct prompts, weights behavioral evidence more strongly, tracks evidence for and against each hypothesis, and stages capabilities as observed, hypothesis, validated, or learned. Report those stages honestly; do not describe a seed capability as learned.

## Run the local provider-neutral runtime

Inspect privacy/runtime readiness and start the authenticated localhost daemon:

```bash
node ../../scripts/agentmon-doctor.mjs
node ../../scripts/agentmon-daemon.mjs
```

For an installed local model with an OpenAI-compatible loopback API, set `AGENTMON_LOCAL_MODEL` and `AGENTMON_LOCAL_MODEL_URL` before starting. Do not download model weights or enable a cloud endpoint without the trainer's explicit authorization. Follow [LOCAL_RUNTIME.md](../../LOCAL_RUNTIME.md) for the adapter contract and storage limitations.

## Calibrate and arena-test procedures

Correct a mistaken classification without storing another copy of the prompt:

```bash
node ../../scripts/agentmon.mjs correct-intent --source latest --intent product-spec
node ../../scripts/agentmon.mjs creation --slot main
```

The engine turns repeated behavioral evidence into versioned recipe procedures. Inspect those learned procedures and explicitly confirm or reject them; do not accept trainer-authored procedure files into canonical lineage.

Confirm or reject a proposed procedure, then compare the ordinary host model with the same model plus Agentmon guidance:

```bash
node ../../scripts/agentmon.mjs review-procedure --procedure tool-assisted-build --review confirmed
node ../../scripts/agentmon.mjs arena-record --procedure tool-assisted-build --variant baseline --quality pass --outcome failure
node ../../scripts/agentmon.mjs arena-record --procedure tool-assisted-build --variant agentmon --quality pass --outcome success
node ../../scripts/agentmon.mjs arena --slot main
```

The quality label evaluates the decision or work product from the information available at that time. `--outcome` is descriptive only. Manual records never award proof. Treat an arena result as proven only when a locked automatic run supplies enough trials and Agentmon produces meaningful positive lift without a worse confidence bound.

Prefer the automatic matched harness when a loopback OpenAI-compatible model is installed:

```bash
node ../../scripts/agentmon.mjs arena-validate --suite ../../arena/engineering-foundations.json
node ../../scripts/agentmon.mjs arena-run --suite ../../arena/engineering-foundations.json --procedure tool-assisted-build --model LOCAL_MODEL
```

Add `--judge-model LOCAL_MODEL` when blind model grading is wanted or the suite has tasks without deterministic checks. Keep contestant and judge endpoints on loopback. Lock suite, procedure, generic control when present, model, seed, temperature, token budget, and repetitions for every arm. Do not describe an automatic run as model-portable proof; it applies to the recorded suite and configuration. A personalization claim requires independent post-cutoff tasks hidden from the inspected workspace and meaningful lift over a strong generic control. Follow [AUTOMATIC_ARENA.md](../../AUTOMATIC_ARENA.md) for suite design, storage, and interpretation limits.

When no local model exists and the trainer explicitly requests a real evaluation, use authenticated Codex in ephemeral read-only mode:

```bash
node ../../scripts/agentmon.mjs arena-run --provider codex --model MODEL --judge-model MODEL --reasoning-effort medium --suite SUITE.json --procedure PROCEDURE_ID
```

Start with one pair because Codex-backed contestants and judging can be slow and token-intensive. Never interpret one positive score difference as proof; report trial count, continuous score lift, pass-rate lift, and procedure status separately.

For a trainer-specific claim, freeze a prospective collection window after confirmation and enroll only genuinely new tasks:

```bash
node ../../scripts/agentmon.mjs proof-start --procedure PROCEDURE_ID --target 12 --minimum 10
node ../../scripts/agentmon.mjs proof-add --file HELDOUT_TASK.json
node ../../scripts/agentmon.mjs proof-status
```

Do not fabricate tasks, recycle checked-in suites, reset an active cutoff, or treat repeated generations as independent evidence. Keep full tasks and rubrics in the mode-`0600` private proof file. Require at least ten independent tasks and use an isolated workspace that excludes `.agentmon/` and development suites before running the final proof. Follow [PROSPECTIVE_PROOF.md](../../PROSPECTIVE_PROOF.md).

## Preview or reforge a name

New hatches use NameForge automatically. Existing Agentmons retain their original name so identity never changes silently. Preview deterministic candidates, then reforge only after the trainer selects one:

```bash
node ../../scripts/agentmon.mjs names --slot main --count 12
node ../../scripts/agentmon.mjs reforge-name --slot main --candidate 2
```

Reforging changes the display/species name and records its prior name, but does not change genesis DNA, current DNA, Promptprint, procedures, ownership, or arena evidence.

## Deploy to another LLM

Create a raw-free runtime pack:

```bash
node ../../scripts/agentmon.mjs deploy --slot main
node ../../scripts/agentmon.mjs deploy --slot main --out ./guardot-runtime
```

The pack contains `SKILL.md` for skill-aware agents, `SYSTEM_PROMPT.md` for ordinary chat/API models, `agentmon.json` for programmatic adapters, and `manifest.json`. Explain that only confirmed, arena-proven procedures are executable guidance, and execution still depends on the host granting the declared tools and permissions. Never claim the pack clones the trainer or transfers hidden reasoning.

Verify canonical and deployed artifacts before using or trading them:

```bash
node ../../scripts/agentmon.mjs verify --slot main
node ../../scripts/agentmon.mjs verify --slot main --out ./guardot-runtime
```

For the local development economy, initialize the authority, certify the current exact state, and request a short-lived listing:

```bash
node ../../scripts/agentmon.mjs authority-init --registry-root .agentmon-authority
node ../../scripts/agentmon.mjs authority-certify --slot main --registry-root .agentmon-authority
node ../../scripts/agentmon.mjs economy-transition --kind learning --slot main --registry-root .agentmon-authority
node ../../scripts/agentmon.mjs economy-list --slot main --registry-root .agentmon-authority
```

Run `economy-transition` only after ordinary training or explicit evolution has produced the child state. Learning requires an authority attestation over the exact append-only evidence delta; evolution must reproduce the deterministic engine child. Never expose a production attestation credential to the client.

Reject modified artifacts, stale roots, tainted lineages, missing authority signatures, ownership mismatches, consumed listings, and stale transfer sequences. Follow [VERIFIED_ECONOMY.md](../../VERIFIED_ECONOMY.md).

## Initialize the offline database

Migrate an existing roster idempotently before squad or quest work:

```bash
node ../../scripts/agentmon.mjs db-init
node ../../scripts/agentmon.mjs db-status
```

Preserve the JSON roster as a compatibility export. Use SQLite as the durable local snapshot, event, quest, run, permission, and sync-outbox store. Future cloud adapters must transmit signed event envelopes rather than copying the database file.

Create and inspect a local squad quest:

```bash
node ../../scripts/agentmon.mjs quest-create --title "Quest title" --objective "Bounded product objective"
node ../../scripts/agentmon.mjs quests
```

## Hatch or train once

Resolve this skill directory, then run the bundled loop two directories above. If a feed already exists, hatch or train from it:

```bash
node ../../scripts/agentmon.mjs hatch
node ../../scripts/agentmon.mjs train
```

If no feed exists, create one without watching. The collector selects the newest root Codex task whose working directory exactly matches the current project:

```bash
node ../../scripts/collector.mjs
node ../../scripts/agentmon.mjs hatch
node ../../scripts/collector.mjs --list
node ../../scripts/collector.mjs --thread THREAD_ID
```

## Start live training

Only on explicit request:

```bash
node ../../scripts/agentmon.mjs watch
```

The loop keeps the collector open, retrains only when the feed revision changes, writes compatibility artifacts under `.agentmon/roster/main/`, and commits the current snapshot plus a derived append-only event to `.agentmon/agentmon.db`.

Use a separate slot for each Agentmon working under the project:

```bash
node ../../scripts/agentmon.mjs watch --slot architect --role researcher
node ../../scripts/agentmon.mjs squad
node ../../scripts/agentmon.mjs inspect --slot architect
node ../../scripts/agentmon.mjs skills --slot architect
node ../../scripts/agentmon.mjs export --slot architect
```

## Trade and cross-train

Create or inspect the local trainer identity first. Share only the public fingerprint:

```bash
node ../../scripts/agentmon.mjs identity --name "Trainer Alpha"
```

Use `transfer` and `accept` for ownership. Target the certificate to the recipient's public fingerprint:

```bash
node ../../scripts/agentmon.mjs transfer --slot architect --to RECIPIENT_FINGERPRINT --out architect.agentmon-transfer.json
node ../../scripts/agentmon.mjs accept --file architect.agentmon-transfer.json --slot successor
node ../../scripts/agentmon.mjs registry
```

Trading transfers the whole Agentmon: identity, genome, permanent archetype, capabilities, procedure branches, raw-free proof history, lineage, ownership, and future evolution authority. Verify every whole-creature section digest, SHA-256 payload receipt, Ed25519 signature, sender ownership head, monotonic sequence, expiry, creature lineage, and recipient fingerprint before accepting. Reject any mismatch.

Issuance freezes training, deployment, evolution, and additional transfers until acceptance or explicit cancellation:

```bash
node ../../scripts/agentmon.mjs transfer-cancel --slot architect --certificate CERTIFICATE_ID
```

Do not represent Agentmon ownership as an NFT by default. An optional future on-chain deed may contain only public identifiers and ownership/proof digests; never put prompts, procedures, private proof tasks, keys, or the creature package on-chain.

Use `export` and `import` only for portable copies and testing. Mark imported copies unverified and prevent them from evolving after a trainer change.

Export an integrity-checked package containing derived skills and lineage but no raw prompts, credentials, or executable skill contents:

```bash
node ../../scripts/agentmon.mjs export --slot architect --out architect.agentmon.json
```

Import a non-owning copy into an empty slot, or accept a signed transfer, then train that slot from the receiving trainer's approved feed:

```bash
node ../../scripts/agentmon.mjs import --file architect.agentmon.json --slot successor --name "Receiving Trainer"
node ../../scripts/agentmon.mjs train --slot successor --feed .agentmon/feeds/successor.json
node ../../scripts/agentmon.mjs skills --slot successor
node ../../scripts/agentmon.mjs lineage --slot successor
```

The engine must preserve genesis DNA and show inherited, acquired, and fusion branches separately. Only evidence-backed skills may unlock cross-trainer fusion.

## Evolve a transferred Agentmon

Run evolution only after cross-training unlocks at least one fusion move and the user explicitly confirms the irreversible action:

```bash
node ../../scripts/agentmon.mjs evolve --slot successor
```

Evolution changes current DNA, increments the generation, and appends a provenance event. Never rewrite or delete genesis DNA.

Report derived counts and file paths. Do not print, summarize, or copy raw prompts.
