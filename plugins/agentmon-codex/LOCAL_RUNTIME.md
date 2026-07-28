# Agentmon Local Runtime

Agentmon is a local engine with adapters, not a shell around ChatGPT. Codex is the first adapter because its app-server provides conversation history and streamed events for deep local integrations. Other clients use the versioned adapter-batch contract through an authenticated localhost daemon.

```text
Browser extension ─> derived-only route ─┐
Codex app-server ─┐                       │
IDE extension ────┤                       ├─> Agentmon core ─> raw-free SQLite / SKILL.md
Desktop agent ────┼─> encrypted adapter ─┤
CLI or robot ─────┤                       │
Future MCP bridge ┘                       └─> Optional local model (shadow suggestions)
```

## Privacy boundary

- The daemon binds only to `127.0.0.1`, `localhost`, or `::1`.
- Native requests require a bearer token stored with owner-only permissions in `.agentmon/daemon-token`.
- A browser extension receives a separate in-memory token after presenting a high-entropy one-time pairing code. The token is bound to that exact extension origin and can call only the narrow `/v1/browser/*` pairing, site-state, submit, routing, feedback, and downlink surface.
- Other browser origins and browser attempts to call native, vault, local-model, roster, or profile routes are rejected.
- The project root is fixed when the daemon starts; callers cannot provide an arbitrary filesystem path.
- Adapter batches may contain only user-authored text under explicit `user_prompts_only` consent.
- Secret redaction runs before an event reaches the feed.
- Raw text is returned neither by ingestion responses nor Agentmon profile endpoints.
- The optional model URL must resolve to a loopback host. Cloud model URLs are rejected by this provider.
- The model operates in `shadow` mode: it may suggest classifications but cannot alter DNA, procedures, trainer reviews, or arena grades.

Browser-submitted prompt text is never persisted: it is analyzed in memory, discarded, and absent from the vault, SQLite, JSON state, `SKILL.md`, and browser storage. Native/import workflows that explicitly require replay store sanitized raw feeds AES-256-GCM encrypted under `.agentmon/vault/`. On macOS the per-project key is stored in Keychain; other platforms require `AGENTMON_VAULT_KEY`. Plaintext fallback is disabled. Legacy file-based collector commands may still create mode-0600 feeds for compatibility; migrate those feeds before claiming an entirely raw-free installation.

`/agentmon auto <slot>` is an explicit, page-memory-only switch. It pauses a submit, asks the loopback companion for a proven context match, injects a raw-free procedure packet when one matches, and resumes the submit. `/agentmon auto off` disables the switch. Disabled sites are rejected server-side even if a paired extension attempts intake or routing.

## Start and diagnose

```bash
npm run agentmon:doctor
npm run agentmon:companion
```

The daemon defaults to `http://127.0.0.1:4765`. It prints the token file path, never the token. Native adapters read that file locally and send `Authorization: Bearer ...`.

It also prints a one-time browser pairing code. The code is not written to the status file, and restarting the companion invalidates the browser token.

## Adapter contract

Send `POST /v1/ingest` with a wrapper containing the target slot and an `agentmon.adapter-batch/v1` batch:

```json
{
  "slot": "main",
  "batch": {
    "format": "agentmon.adapter-batch/v1",
    "adapter": "my-ide",
    "mode": "append",
    "conversation": { "id": "conversation-123", "label": "My project" },
    "consent": { "scope": "user_prompts_only" },
    "events": [
      { "id": "message-1", "role": "user", "content": "Build and test the parser." }
    ]
  }
}
```

The adapter owns authorization to read its source. Agentmon does not scrape another application's private storage, capture global keystrokes, or accept assistant/tool/system content.

## Local model modes

Agentmon supports an OpenAI-compatible loopback endpoint. Ollama and llama.cpp expose compatible local APIs; MLX can be added through a thin server adapter.

```bash
export AGENTMON_LOCAL_MODEL="your-installed-model"
export AGENTMON_LOCAL_MODEL_URL="http://127.0.0.1:11434/v1"
npm run agentmon:doctor
npm run agentmon:daemon
```

The desktop Agentmon Gateway can use a loopback model, OpenAI, or Gemini as the answer provider. It automatically compiles the active Agentmon identity and relevant proven procedures into each request, maintains at most twelve conversation turns in memory, and stores neither prompts, responses, nor chat history. Generic Mode uses the same provider and model with Agentmon context disabled so usefulness can be compared honestly. Cloud keys live in macOS Keychain, custom endpoints remain loopback-only, and prompts go directly to the explicitly selected provider rather than an Agentmon service.

Eligible answers receive a one-time Helped/Missed/Retry token bound to the task digest and matched proven procedure IDs. Recording feedback persists only the derived outcome, provider/model identifiers, and procedure references. The task text, response text, and conversation history remain excluded, and trainer feedback cannot award arena proof by itself.

The semantic-induction path remains a separate shadow mode: it may classify or suggest bounded primitives but cannot alter DNA, trainer reviews, arena grades, or executable procedures.

Do not choose a large model merely because it can technically load. A quantized 3B–8B instruct model is an appropriate background tier for a 16 GB machine. Larger reasoning models can be optional chat or evaluation workers rather than always-resident daemons.

`POST /v1/local/suggestions` sends at most 50 selected local prompts to the loopback model and stores only raw-free classifications in `local-suggestions.json`. Suggestions do not train the Agentmon until a trainer or a future calibrated acceptance policy approves them.

The automatic arena uses the same loopback-only OpenAI-compatible boundary but is not shadow classification. It runs explicit, trainer-requested baseline and Agentmon trials, then records their grades as procedure evidence. See [AUTOMATIC_ARENA.md](./AUTOMATIC_ARENA.md).

## Connecting product surfaces

- **Codex:** keep the current app-server adapter. App-server is appropriate for rich clients that need local conversation history, approvals, and streamed events.
- **Other IDEs/desktop apps:** implement the adapter-batch POST contract and read the daemon token from the local project.
- **Browser LLMs:** the opt-in Manifest V3 extension captures only actual submitted prompts on individually enabled ChatGPT, Claude, Gemini, or Kimi origins and uses derived-only retention.
- **API agents:** add an adapter at the application's message/event boundary before provider calls. The model provider can be OpenAI, Anthropic, Google, or local; Agentmon receives the same normalized user event.
- **Robots:** send operator instructions and task outcomes through separate typed events. Never mix sensor telemetry or autonomous actions into user-prompt consent.
- **Cloud synchronization:** synchronize signed derived events and ownership records, never the raw feed or SQLite database file.

Future adapters should depend only on the versioned contract, not on Codex-specific storage or the internals of the learning engine. See [CONNECTORS.md](./CONNECTORS.md) for Codex, Antigravity, Kimi, ChatGPT export, and generic adapter setup.
