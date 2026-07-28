# Agentmon Engine V4

Engine V4 closes the loop between observed trainer behavior, deployed procedures, and measured usefulness while preserving the local-first privacy boundary.

## Closed learning loop

1. An approved adapter supplies a submitted user prompt in transient memory.
2. The deterministic engine records raw-free intent, capability, and evidence digests.
3. An optional loopback-only model receives only the raw-free evidence packet and selects bounded workflow primitives.
4. The deterministic procedure compiler renders the candidate. The model cannot author executable instruction text or permissions.
5. The trainer confirms or rejects the candidate.
6. A confirmed candidate enters arena testing. It remains unavailable to runtime packs until it is arena-proven.
7. A proven procedure can be selected by the permission-aware context router.
8. The trainer may record a derived outcome. Outcomes measure usefulness but never award arena proof.
9. Five or more consistently negative outcomes mark a procedure regressed and remove it from browser and deployment downlinks.

## Browser feedback

Use the Chrome popup's **Agentmon Mode** toggle to opt into per-submit routing for the current tab. `/agentmon auto <slot>` and `/agentmon auto off` remain keyboard shortcuts. The exact submitted prompt is matched in memory against proven, non-regressed procedures, then discarded; only a SHA-256 digest and selected procedure ids may be retained. Routing does not grant tools or permissions to the host LLM. Mode resets when the page reloads and is never enabled globally without an explicit action.

After activating or auto-routing an Agentmon, record the result of the last task with:

```text
/agentmon helped
/agentmon missed
```

The extension submits only the task SHA-256 digest, activated procedure ids, rating, outcome, and bounded correction metadata. It never submits the assistant response. The event is stored locally and has `proofEligible: false`.

## CLI

```bash
npm run agentmon -- effectiveness --slot main
npm run agentmon -- outcome-record --procedure ID --task-digest SHA256 --outcome success --rating helped
npm run agentmon -- route --file TASK.txt --permissions read-files,write-files,run-tools
npm run agentmon -- semantic-suggest --slot main
npm run agentmon -- semantic-review --proposal ID --review confirmed
npm run agentmon -- portability-record --procedure ID --provider local --model MODEL --suite-digest SHA256 --baseline-score 60 --agentmon-score 80
npm run agentmon -- portability-run --procedure ID --suite plugins/agentmon-codex/arena/engineering-foundations.json --targets .agentmon/model-targets.json
npm run agentmon -- squad-plan --objective "Ship the next release" --permissions read-files,write-files,run-tools
```

`route` reads the task file transiently and returns only a query digest, ranked procedures, and a bounded downlink. `squad-plan` stores no objective text and does not execute automatically. The squad execution API requires every assignment id to be explicitly approved, accepts a caller-supplied runner and reviewer, keeps worker artifacts private, and emits a raw-free public run record. `portability-run` reads an explicit target manifest, runs the same locked suite across enabled local or Codex adapters, and retains only scores, lift, provider/model ids, and suite digests. Target manifests reject credentials, and local adapters reject non-loopback URLs. Start from `arena/model-targets.example.json`; all example targets are disabled to prevent surprise model usage.

The contextual router has an out-of-distribution gate: procedure confidence and prior outcomes may rank a semantically relevant match, but can never make a zero-overlap procedure activate. Optional `routing` policies can require multiple concept groups, exclude known off-scope concepts, and raise minimum semantic thresholds. Every result includes a raw-free routing audit (`procedure-match` or `identity-only`, counts, and rejection categories) without returning or persisting query terms.

## Canonical semantic induction

Semantic candidates are assembled only from allowlisted triggers, steps, completion rules, skills, and permissions. The candidate contains:

- a compiler identifier;
- the selected primitive structure;
- a structure digest;
- an evidence root covering at least three behavioral observations;
- a digest of the optional shadow model identity;
- an explicit raw-prompt-free marker.

The economy verifier reconstructs the compiled procedure and rejects edited steps, permissions, triggers, completion rules, or evidence. Free-form trainer-authored procedures remain modded and ineligible for official certification.

## Effectiveness statuses

- `insufficient`: fewer than five outcomes;
- `beneficial`: at least five outcomes, average score of at least +10, and at least 60% marked helpful;
- `monitoring`: enough evidence without a decisive direction;
- `regressed`: average score at most -10 or misses exceed helpful outcomes.

The usefulness score combines trainer rating, task outcome, correction severity, and retries. It is a product signal, not scientific proof. Prospective held-out arena trials remain the proof boundary.

## Storage

Migration `0008_effectiveness_loop.sql` adds normalized `outcome_events` and `portability_results`. Both tables contain derived data only. Raw prompt text, assistant responses, credentials, and hidden reasoning are rejected at the outcome schema boundary.
