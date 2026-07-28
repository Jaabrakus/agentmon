# Creation Engine V3: Limited-Information Learning

Agentmon V3 adapts the most useful training ideas from Attractive Ace Mentor Pro without copying poker rules into the creature. Poker is the model because it forces an agent to choose under uncertainty, separate decision quality from outcome luck, revise beliefs from evidence, and calibrate confidence.

## Transfer from poker to Agentmon

| Poker training concept | Agentmon V3 primitive |
| --- | --- |
| Judge the choice from information available at the decision | Decision episode with known facts, unknowns, and estimates |
| Separate a sound play from a lucky result | `decisionQuality` is independent from `outcome` |
| Observe a tell, form a weak read, test it, update confidence | Behavior hypothesis with evidence for, evidence against, neutral context, and status |
| Compare a strategy against a control | Baseline LLM versus LLM + Agentmon procedure arena |
| Calibrate reads instead of pretending certainty | Trainer intent corrections and explicit confidence |
| Require repeated, contextual evidence | Observed → hypothesis → validated → learned procedure stages |

## V3 loop

1. Observe a submitted, sanitized user prompt from one approved task.
2. Classify its intent using only facts available at that moment.
3. Record a raw-free decision episode: digest, known facts, unknowns, estimate, and confidence.
4. Let the trainer correct the intent. The correction becomes contrary evidence where appropriate and retrains the current profile.
5. Build testable behavior hypotheses. Never turn them into personality diagnoses or claims about hidden reasoning.
6. Generate permission-bounded procedures only from repeated behavioral evidence.
7. Let the trainer confirm or reject each procedure.
8. Run matched tasks with the baseline host model and with the Agentmon procedure. Grade decision quality independently of later outcome.
9. Mark a procedure proven only after both baseline and Agentmon have at least five trials, Agentmon has at least ten percentage points of lift, and its Wilson lower confidence bound is no worse. When claiming personalization, also require meaningful lift over a strong generic control.
10. Export executable guidance only when the trainer confirmed the procedure and its arena status is proven. Keep every other stage visible as developing evidence.

The implemented automatic harness uses `agentmon.arena-suite/v1` benchmark packs, seeded arm ordering, randomized blind identities, deterministic checks, and an optional blind model judge. Suites may add a generic-control arm to distinguish procedural personalization from generic prompt augmentation. It locks model and experiment configuration before any variant runs. Full run artifacts remain local; SQLite stores scores and digests only. See [AUTOMATIC_ARENA.md](./AUTOMATIC_ARENA.md).

All calibration records, hypotheses, arena trials, ledgers, database events, runtime packs, and trade packages are raw-prompt-free. Raw prompts remain only in the consent-scoped local feed.

## NameForge

The former fixed species list created obvious collisions such as many unrelated Mons named Guardot. New hatches now combine two or three deterministic synthetic syllables selected from cross-linguistic sound-shape packs. The engine records the seed digest, selected packs, templates, component syllables, and an ASCII ownership skeleton.

NameForge does not scrape or recombine words from living languages. PHOIBLE provides phonological inventories rather than a universal syllable dictionary, and Glottolog's catalog changes as linguistic scholarship changes. Full dataset ingestion therefore belongs in a separately licensed, versioned adapter—not hardcoded claims that a small list represents every language. Existing Agentmons keep their names until an explicit `reforge-name` action; reforging preserves DNA and evidence.
