# Verified Agentmon Economy

Official trading uses cryptographic verification, not filesystem permissions. An owner controls their local files and can always make a private mod, but that modification cannot preserve the official state root or registry signature.

## Economy states

- `local-unverified`: clean learned-only lineage, but no registry certificate for its current state root.
- `verified`: the authority signed this exact state root for the registered owner.
- `modded`: the lineage contains trainer-authored procedure content, imported skill-package content, an unverified copy, or another permanent taint.
- `revoked`: the authority has explicitly removed the creature from the official economy.

Every persisted snapshot commits the creature identity, genesis/current DNA, generation, permanent archetype, owner/sequence, immutable procedure revision hashes, and automatic arena trials. Manual arena notes are stored but excluded from proof and the state commitment's proof set.

The authority also compares every claimed `recipe` procedure against its own canonical recipe catalog. Changing steps, triggers, permissions, completion criteria, or failure rules while leaving the provenance label as `recipe` is rejected.

Certification is fail-closed after registration: the same owner cannot use the certification endpoint to bless a different state root. Normal learning or evolution first moves a local Agentmon back to `local-unverified`, then the verified-transition protocol must approve that exact parent-to-child change. A successful transition restores `verified` without allowing the ordinary certification endpoint to bless an arbitrary mutation.

## Verified learning and evolution

Every authorized change has two independent monotonic counters: ownership sequence and transition sequence. The trainer signs the exact parent root, child root, raw-free snapshot digests, expected counters, nonce, and optional learning-attestation digest. The registry consumes the parent root once, advances the transition sequence atomically, records an append-only certificate, and cancels every active listing for the old root.

Learning is constrained to append-only derived evidence, outcomes, portability results, and automatic arena history. It cannot change hatch DNA, identity, permanent archetype, lineage, ownership, or existing procedure structure. Every procedure evidence digest must resolve to a committed observation. The authority must attest the exact evidence and automatic-run delta.

Evolution may permanently change current DNA, form, generation, moves, and lineage, but only when the submitted child exactly reproduces deterministic engine evolution from the certified parent. It cannot carry a learning attestation in the same transition.

After training or evolution, authorize the new state before listing it:

```bash
npm run agentmon -- economy-transition --kind learning --slot main --registry-root .agentmon-authority
npm run agentmon -- economy-transition --kind evolution --slot successor --registry-root .agentmon-authority
npm run agentmon -- verify --slot main
```

The bundled command uses the local development authority to issue its own learning attestation. In production, that endpoint belongs behind the registry's trusted ingestion and arena boundary; a marketplace client must not possess its credential.

## Local verification

```bash
npm run agentmon -- verify --slot main
npm run agentmon -- deploy --slot main
npm run agentmon -- verify --slot main --out .agentmon/deploy/main-AGENTMON_ID
```

Deployment files are marked read-only to reduce accidents. This is not a security boundary: `verify` regenerates the expected artifacts and checks their hashes. Editing `SKILL.md`, `SYSTEM_PROMPT.md`, or `agentmon.json` makes that pack fail verification.

Trainer-authored procedure proposals are disabled for canonical Agentmons. Procedures originate from versioned engine recipes learned from repeated behavior. Manual arena records remain annotations and can never award `proven`; only automatic locked arena runs contribute certifying trials.

## Development authority

The included authority is a local development implementation of the future hosted registry:

```bash
npm run agentmon -- identity --name "Trainer Alpha"
npm run agentmon -- authority-init --registry-root .agentmon-authority
npm run agentmon -- authority-certify --slot main --registry-root .agentmon-authority
npm run agentmon -- economy-list --slot main --registry-root .agentmon-authority
npm run agentmon -- economy-transfer --listing LISTING_ID --to RECIPIENT_FINGERPRINT --sequence 0 --registry-root .agentmon-authority
```

Run the same authority core behind an authenticated loopback HTTP boundary:

```bash
npm run agentmon:economy-server -- --registry-root .agentmon-authority --port 4319
```

Its bearer token is stored mode-`0600` in `.agentmon-authority/registry-token`. The service accepts no browser Origin, caps request bodies, and exposes certification, learning-attestation, transition, listing, transfer, and authority-record endpoints only on `127.0.0.1`.

The authority signs state, transition, and listing certificates with Ed25519. Listing issuance requires the current state root, a clean lineage, an authority certificate, and the registered owner. Transition and transfer finalization each happen in one SQLite transaction and reject stale or replayed requests.

For production, put the authority database and private signing key on a separately secured service. Clients should receive only the public key and signed certificates. Never ship `.agentmon-authority/authority-private-key.pem` with the desktop app or website.

## What this guarantees

It guarantees that the official registry can distinguish an exact authority-certified state from a changed, stale, copied, or manually authored state. It does not prevent someone from modifying their own local software or sharing a clearly unofficial mod outside the registry.

The bundled development authority does not prove that a person genuinely authored the local training prompts or that a machine owner did not fabricate local evidence. A production economy must pin the official authority public key and add trusted capture receipts plus authority-approved arena attestations (or platform/device attestation) before marketing trainer authenticity or performance as verified. This distinction is deliberate: cryptographic lineage is implemented now; proof of real-world human behavior requires a separate trust source.
