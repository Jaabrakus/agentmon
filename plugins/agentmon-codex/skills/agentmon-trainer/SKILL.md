---
name: agentmon-trainer
description: Connect, hatch, or train an Agentmon from the current Codex task by creating a local consent-scoped feed containing only the user's prompts. Use when the user explicitly asks to connect Codex to Agentmon, hatch an Agentmon from a task, or update its Promptprint from ongoing work.
---

# Agentmon Trainer

Create the Agentmon feed only after the user explicitly asks to connect or train from Codex.

## Privacy boundary

- Collect user-authored text from one task only.
- Never collect system or developer instructions, assistant responses, reasoning, tool output, command output, file contents, images, or audio.
- Apply the collector's secret redaction before writing the feed.
- Keep the feed in the current project under `.agentmon/`; never commit it.
- Report counts and the feed path, but do not print or summarize the raw prompt contents.
- Start continuous watching only when the user explicitly requests live training.

## Create a one-time feed

Resolve this skill directory, then run its bundled collector two directories above:

```bash
node ../../scripts/collector.mjs
```

The collector selects the newest root Codex task whose working directory exactly matches the current project. If the user identifies a different task, list task metadata without prompt contents and pass the selected id:

```bash
node ../../scripts/collector.mjs --list
node ../../scripts/collector.mjs --thread THREAD_ID
```

## Start live training

Only on explicit request:

```bash
node ../../scripts/collector.mjs --watch
```

Tell the user to open Agentmon Lab, choose **Connect Codex**, approve the privacy receipt, and select `.agentmon/codex-feed.json`. When supported, the game watches that approved file and trains as new prompts arrive.
