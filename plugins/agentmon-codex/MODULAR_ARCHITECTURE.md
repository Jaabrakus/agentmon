# Agentmon Modular Architecture

Authored engine modules have a 500-line ceiling. `lib/agentmon-engine.mjs` is the exception because it is a generated deployment bundle; its authored entrypoint is the small `agentmon-engine.ts` facade.

## Creation and visual identity

- `lib/engine/`: types, catalog, naming, training, lifecycle, and deployment compilers.
- `lib/visual/phenotype-engine.mjs`: DNA to deterministic phenotype.
- `lib/visual/curated-visual-engine.mjs`: DNA to one quality-gated V3 family/colorway and immutable local asset.
- `lib/visual/palette-engine.mjs`: 16 curated palette families and four harmony modes.
- `lib/visual/material-ramp.mjs`: five-tone ramps for body, accent, signal, and screen materials.
- `lib/visual/raster-primitives.mjs`: dependency-free pixel surfaces, shapes, blitting, and PNG encoding.
- `lib/visual/premium-chassis.mjs`: ten distinct 64px chassis silhouettes and shaded face panels.
- `lib/visual/premium-components.mjs`: shaded eyes, ears, tails, limbs, markings, crests, and proof equipment.
- `lib/visual/pixel-renderer.mjs`: thin composition facade for premium creature and egg PNGs.
- `assets/visual-v3/`: versioned authored source atlases, transparent family sprites, 256 canonical creature forms, and 256 matching egg forms.
- `scripts/build-curated-visual-pack.mjs`: reproducible atlas slicing, colorway construction, and border/coverage/material QA.
- `lib/visual/visual-lineage.mjs`: append-only forms and identity lock.
- `lib/visual/gallery-renderer.mjs`: deterministic population inspection sheets.

## Runtime and persistence

- `lib/runtime/storage.mjs`: private local paths and atomic writes.
- `lib/runtime/training-service.mjs`: feed-to-Agentmon orchestration.
- `lib/runtime/procedure-proof-service.mjs`: review and prospective proof lifecycle.
- `lib/runtime/package-lifecycle-service.mjs`: deploy, whole transfer, import, and evolution.
- `lib/db/local-store.mjs`: SQLite transactions and normalized persistence.
- `scripts/agentmon.mjs` and `scripts/agentmon-db.mjs`: compatibility facades and thin command routing.
- `lib/effectiveness/outcome-engine.mjs`: raw-free trainer outcomes, usefulness scoring, and regression states.
- `lib/effectiveness/portability-engine.mjs`: model/provider compatibility matrix.
- `lib/routing/context-router.mjs`: permission-aware, proven-only Agentmon and procedure selection.
- `lib/semantics/semantic-induction.mjs`: bounded primitive compiler and structural verification.
- `lib/squad/squad-orchestrator.mjs`: digest-only, approval-required squad planning.
- `lib/runtime/v4-learning-service.mjs`: thin orchestration over the V4 modules.
- `lib/db/effectiveness-store.mjs`: normalized derived-only outcome and portability persistence.

## Proof and ownership

- `lib/proof/isolated-workspace.mjs`: disposable private filesystem snapshots; not a network or hostile-code sandbox.
- `lib/proof/human-scoring.mjs`: blinded packets and raw-free paired statistics.
- `lib/proof/proof-certificate.mjs`: Ed25519 signed, raw-free certificates.
- `lib/ownership/transfer-crypto.mjs`: whole-Agentmon package and transfer signatures.
- `lib/ownership/ownership-authority.mjs`: local compare-and-swap reference state machine.
- `cloud/postgres/ownership-authority.sql`: deployable PostgreSQL/Supabase authority foundation.

## Safety invariants

1. Raw prompts and proof outputs never enter public certificates or ownership events.
2. Snapshot isolation prevents proof commands from mutating the source; untrusted code still requires a container or VM.
3. Visual equipment requires a trainer-confirmed, arena-proven procedure.
4. Genesis-derived visual identity cannot drift during ordinary training.
5. Ownership commands require an exact expected sequence and head digest.
6. The cloud function locks the ownership row and appends one command per sequence.
7. The architecture test rejects authored modules over 500 lines.
8. The visual quality test rejects regressions below the 64px grid, five-tone ramp, rendered-color floor, or ten distinct chassis masks.
9. Real-world feedback never awards proof and a regressed procedure is excluded from every downlink.
10. A shadow semantic model selects primitives only; deterministic compilation owns all executable text and permissions.
