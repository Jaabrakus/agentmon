# Agentmon Codex Adapter

The adapter turns one approved Codex task into a local `agentmon.feed/v1` file. It uses the official Codex app-server interface and keeps the boundary intentionally narrow: user-authored text prompts only.

## Start

From the project whose Codex task you want to connect:

```bash
node plugins/agentmon-codex/scripts/collector.mjs --watch
```

The live feed is written to `.agentmon/codex-feed.json`. Open Agentmon Lab, choose **Connect Codex**, approve the privacy receipt, and select that file.

Use `--list` to display matching task ids without prompt contents, or `--thread THREAD_ID` to select one explicitly.

## Privacy

The adapter excludes assistant messages, system/developer instructions, reasoning, tools, command output, files, images, audio, and detected credentials. Raw feed files are local and ignored by Git. Trade packages never include them.
