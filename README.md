# Agentmon Lab

Agentmon turns a person's prompting style, agent skills, and repeatable workflows into an original collectible creature. The game is local-first: raw prompts are training material, while trade packages contain only derived Promptprint traits and approved portable skills.

## Codex-connected vertical slice

The included Agentmon Codex adapter reads one approved task through the official Codex app-server interface. It exports only sanitized user-authored text prompts to a local feed.

```bash
npm install
npm run agentmon:codex
```

The live feed is written to `.agentmon/codex-feed.json`. In Agentmon Lab, choose **Connect Codex**, approve the privacy receipt, and select that feed. When the browser supports persistent file handles, the game checks it for new turns and trains automatically.

The collector excludes assistant responses, system and developer instructions, reasoning, tools, command output, file contents, images, audio, and detected credentials. `.agentmon/` is ignored by Git.

## Development

```bash
npm run dev
npm run build
npm run test:collector
```

The Codex plugin source lives under `plugins/agentmon-codex/`.
