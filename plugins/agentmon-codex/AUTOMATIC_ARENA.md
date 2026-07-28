# Agentmon Automatic Arena

The automatic arena is a local matched-experiment runner. It answers one narrow question: does a specific Agentmon procedure improve the same model on the same benchmark tasks? When a suite supplies a generic control, it also tests whether the gain is trainer-specific or merely the benefit of receiving any competent checklist.

For each task and repetition it:

1. Locks the suite version and digest, procedure digest, model endpoint, model name, temperature, token budget, seed, and repetition count.
2. Calls the contestant in a seeded order: once with ordinary instructions, optionally once with a generic control, and once with the Agentmon procedure added.
3. Randomizes the outputs as anonymous candidates before optional model judging.
4. Scores deterministic rubric checks and, when configured, combines them with a blind judge score.
5. Records separate baseline and Agentmon trials plus raw-free generic-control metrics. Later real-world outcomes remain independent from the arena grade.
6. Updates the procedure's ordinary arena status using the existing minimum-trial, lift, and Wilson-bound policy. A separate personalization status requires at least five trials and meaningful lift over both baseline and generic control.

## Quick start

The bundled engineering gym contains five tasks:

```bash
npm run agentmon -- arena-validate --suite plugins/agentmon-codex/arena/engineering-foundations.json
export AGENTMON_ARENA_MODEL="your-installed-model"
export AGENTMON_ARENA_MODEL_URL="http://127.0.0.1:11434/v1"
npm run agentmon -- arena-run \
  --suite plugins/agentmon-codex/arena/engineering-foundations.json \
  --procedure tool-assisted-build \
  --model "$AGENTMON_ARENA_MODEL"
```

Add `--judge-model MODEL` to use a blind model judge. A judge is required for tasks without deterministic checks. The judge may use a separate loopback endpoint through `AGENTMON_ARENA_JUDGE_URL`.

To evaluate through the authenticated Codex CLI instead of a local model server, use read-only ephemeral execution:

```bash
npm run agentmon -- arena-run \
  --provider codex \
  --model gpt-5.6-sol \
  --judge-model gpt-5.6-sol \
  --reasoning-effort medium \
  --suite plugins/agentmon-codex/arena/pokemonllm-next-milestone.json \
  --procedure focused-implementation
```

Codex arena runs use configured Codex authentication, ignore user configuration and repository rules, disable writes and approvals, and create ephemeral sessions. They may consume materially more time and model tokens than local deterministic gyms; start with one paired task before scheduling a full proof suite.

## Suite format

Suites use `agentmon.arena-suite/v1`. Each task has a stable ID, prompt, pass threshold, and optional weighted checks. V1 supports `includes`, `excludes`, `starts-with`, `json-keys`, and `max-characters`. Suites are limited to 100 tasks; repetitions are limited to 20. Add a `genericControl` object with a stable `id`, positive integer `version`, and `instructions` to activate the three-arm comparison.

Deterministic checks make a gym reproducible, not automatically scientifically valid. Avoid checks that reward keyword stuffing. Use post-cutoff held-out tasks, version suites when a prompt or rubric changes, and prefer a separate judge plus human review for valuable skills. A task or rubric checked into the workspace inspected by contestants is development material, not credible held-out evidence.

## Storage and security

- Local contestant and judge URLs must be loopback addresses. The arena CLI rejects arbitrary cloud endpoints. The explicit `codex` provider invokes the authenticated Codex CLI in ephemeral read-only mode instead of accepting a URL.
- Full prompts, outputs, blind maps, and judge results are written mode `0600` to `.agentmon/arena/runs/RUN_ID/run.json` or an explicit `--out` directory.
- SQLite stores suite/configuration digests, model descriptors, scores, pass flags, and raw-free check outcomes. It has no prompt or output columns.
- The learning ledger stores only the run ID, configuration digest, aggregate summary, and privacy flags.
- Candidate output is untrusted. The bundled judge instruction explicitly ignores instructions embedded in candidates.

## Interpretation limits

An arena result is evidence about one procedure, model/configuration, and suite version. One positive run is directional evidence only. It is not proof that the Agentmon cloned its trainer, works on every model, or will generalize beyond the benchmark. Credible personalization evidence must beat a strong generic control on multiple independent, post-cutoff tasks that were hidden from the inspected workspace. Re-run across models and held-out suites before trading a procedure as broadly portable.
