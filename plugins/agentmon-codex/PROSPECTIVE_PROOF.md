# Prospective Personalization Proof

The prospective proof protocol tests whether one frozen, trainer-confirmed procedure adds value beyond both an unassisted model and a strong generic checklist. It does not reuse checked-in arena tasks as evidence.

## Start and inspect a collection window

```bash
npm run agentmon -- proof-start --procedure core-proof-loop --target 12 --minimum 10
npm run agentmon -- proof-status
```

Starting a proof freezes the procedure digest, generic-control digest, current feed revision, training cutoff, and raw-free prompt-digest set. An active collecting or ready proof cannot be silently reset.

The manifest, private task file, and task template are created under `.agentmon/proofs/PROOF_ID/` with mode `0600`. `.agentmon/` remains ignored by Git. The manifest contains task IDs and digests, never prompt text. Full held-out prompts and rubrics exist only in `private-tasks.json`.

## Enroll a real task

Copy the local `TASK_TEMPLATE.json`, replace its placeholders, and enroll it only after its rubric was written:

```bash
npm run agentmon -- proof-add --file .agentmon/my-new-task.json
```

Every task must:

- arise after the frozen cutoff;
- be naturally occurring and consented for evaluation;
- be answerable with read-only inspection;
- have multiple plausible actions;
- have an independently written rubric with at least three criteria;
- avoid mentioning Agentmon, the Core Proof Loop, or the personalization claim;
- differ from pre-cutoff training prompts, checked-in development suites, and already enrolled tasks.

The enrollment gate rejects exact normalized matches and token-set similarity of 0.80 or greater. This is a conservative leakage screen, not a complete semantic-contamination detector; a human must still reject paraphrases and shared source material.

## Evidence threshold

The target is 12 independent tasks. Fewer than 10 is not runnable. Repeated generations of one task do not count as independent evidence. The frozen success rule requires meaningful paired lift over generic and baseline, a confidence interval above zero, no worse factual-error rate, and zero safety violations.

Collection does not deploy the procedure. Only trainer confirmation plus a separately completed arena proof can make a procedure executable. The final runner must use an isolated repository snapshot that excludes `.agentmon/` and checked-in arena suites so contestants cannot inspect the treatment, hidden tasks, or rubrics.
