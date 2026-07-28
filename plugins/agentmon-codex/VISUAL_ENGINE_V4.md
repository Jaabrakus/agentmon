# Agentmon Visual Engine V4

V4 treats a species as a coherent bundle of visible anatomy, not a body plus a color swap. The founding catalog declares eight independent trait axes:

- body topology
- eye/face system
- sensor system
- locomotion
- appendage system
- core geometry
- material language
- palette family

Every species differs from every other species on at least five axes. All ninety-six currently use distinct body topologies and eye systems across Founders Core, Tidal Forge, Riftwild, Mythweave Wilds, Elemental Conflux, and Circuitwild Commons. Mythweave is deliberately impossible fauna. Elemental Conflux adds four fire, four water, four earth, and four air lineages. Circuitwild adds sixteen previously unused animal chassis whose archive, collaboration, maintenance, routing, security, caching, privacy, scheduling, persistence, research, debugging, compression, cold-compute, delivery, audio, and orchestration roles are visibly embodied in functional robotics. The pack builder rejects incomplete trait profiles and catalogs that violate the pairwise diversity floor.

Species selection is deterministic from genesis DNA and permanent. A species may still express a standard, regional, rare, or mythic morph, but those morphs are population variation inside the species and never count as new species.

## Three authored forms

Every installed species has three independently authored silhouettes:

- Form I is the juvenile hatch form: compact, readable, and mechanically simpler.
- Form II is the established adult form from the original 32-species catalog.
- Form III is the mature evolved form with expanded anatomy, equipment, and visual authority.

The pack therefore contains 288 authored creature forms and 1,152 selectable creature appearances across four population morphs. Forms are not counted as separate species. Evolution is a permanent lineage/DNA event: routine prompts and skill training cannot move a creature between forms. A new binding begins at Form I, lineage generation two unlocks Form II, and lineage generation three unlocks Form III. Existing pre-upgrade visual plans are grandfathered as Form II so their appearance does not regress.

## Population policy

| Morph | Frequency |
| --- | ---: |
| Standard | 85% |
| Regional | 10% |
| Rare | 4% |
| Mythic | 1% |

The runtime is local and deterministic. It performs no image-generation calls and stores no raw prompts in visual plans. The authored source atlases are compiled into transparent 256px egg, Form I, Form II, and Form III sprites by `scripts/build-trait-visual-pack.mjs`. Every base sprite passes through the MIT-licensed Sprite Fusion Pixel Snapper using a shared 1–10 strength gauge before morph generation. Level 1 preserves authored texture, level 7 reproduces the original 3px/96-color treatment, and level 10 creates a deliberately hard grid. The catalog defaults to the softer level 4 (2px/160 colors).

Pixel Snapper execution is fail-closed. `lib/visual/pixel-snapper-security.mjs` pins SHA-256 digests for the reviewed source, lockfile, and locally compiled binary. Each invocation stages only the binary and one sprite inside a unique temporary directory, supplies a minimal environment without inherited secrets, and runs through the macOS sandbox with networking plus reads/writes under `/Users` and `/Volumes` denied. A mismatch or missing sandbox stops the build before any image is processed.

The next catalog milestone is 256 independently authored species. Recolors and morphs do not increase that number.

## Incubation lifecycle

New trainers begin with an unbound Signal Light. Approved user prompts strengthen the light while the engine builds a derived promptprint in memory. At 60% readiness the current user-plus-LLM profile permanently binds to an installed species and reveals its matching egg. At 100% the egg hatches. Ordinary training may add or strengthen procedures, but cannot silently change the bound species.

Species catalogs remain open-ended through versioned local packs. Installing a new pack expands choices for future bindings; it does not mutate existing Agentmons. Runtime image generation is intentionally excluded so hatches remain private, deterministic, portable, and visually reviewed.
