# Agentmon Local Connectors

Agentmon learns through explicit, user-authorized connectors. It never captures global keystrokes, scrapes browser profiles, or reads another application's private storage without that application's supported hook or an export chosen by the trainer.

## Turn on the companion

```bash
npm run agentmon:companion
```

This starts the authenticated loopback daemon, initializes the encrypted vault, and reports whether the selected slot is an unhatched egg or a trained Agentmon. Raw prompt feeds use AES-256-GCM. On macOS the project key lives in Keychain; other platforms must provide `AGENTMON_VAULT_KEY`. Plaintext fallback is disabled.

The terminal also prints a one-time browser pairing code. Browser ingestion is a separate, narrower path: it analyzes the submitted prompt in memory and persists only raw-free derived learning. It never writes browser prompt text into the encrypted vault or SQLite.

If this project used the legacy collector, migrate and verify its existing feed first. Plaintext is removed only when the explicit flag is present:

```bash
npm run agentmon:vault-migrate -- --slot main --remove-plaintext
```

## Codex

With the companion running, start the approved-task collector in a second terminal:

```bash
npm run agentmon:codex-live -- --slot main
```

Only user-authored text from the selected task enters the encrypted vault. Assistant messages, tool calls, outputs, files, system instructions, and detected secrets are excluded.

## Google Antigravity

Copy or link `plugins/agentmon-codex/integrations/antigravity-agentmon` into the workspace's `.agents/plugins/agentmon-local-companion/` directory. Its official `PreInvocation` hook supplies a transcript path; the adapter conservatively selects only records marked as user messages and submits a snapshot to the local daemon.

## Kimi Code

Install `plugins/agentmon-codex/integrations/kimi-agentmon` as a local Kimi plugin. Its official `UserPromptSubmit` hook sends only the prompt that the trainer explicitly submitted. Start a new Kimi session or reload plugins after installation.

## Browser LLMs: ChatGPT, Claude, Gemini, and Kimi

Load `browser-extension/` through `chrome://extensions` using **Load unpacked**. Open the extension, enter the one-time code printed by `npm run agentmon:companion`, and enable only the current supported site. Site permissions are optional and independently revocable.

The content script listens only for submit, send-button click, and unmodified Enter events. It has no input listener, traffic interception permission, broad host permission, or response collector. The background worker sends the submitted text to `http://127.0.0.1:4765/v1/browser/ingest`; the daemon derives raw-free observations and discards the text.

## ChatGPT export

For an intentional historical import, extract `conversations.json` from a trainer-requested ChatGPT data export, start the companion, then run:

```bash
npm run agentmon:import-chatgpt -- --file /path/to/conversations.json
```

The importer keeps only messages whose export role is `user`, redacts common secrets at daemon ingestion, and stores the resulting feed only in the encrypted local vault. This replayable import path is distinct from the live browser connector's no-raw-retention path.

## Other LLMs and agents

Native apps, IDE extensions, API agents, and robot bridges submit `agentmon.adapter-batch/v1` to `POST /v1/ingest`. Provider output is not required: Agentmon sits at the user's message boundary, so OpenAI, Anthropic, Google, Kimi, and local models share one normalization and privacy path.
