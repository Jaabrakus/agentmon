# Agentmon Native Prototype

A cross-platform desktop shell for the Agentmon experience, built with Tauri 2 and Rust. The interface uses framework-free HTML, CSS, and JavaScript—there is no React runtime.

Version 0.19.0 turns the full desktop shell into a cross-platform local-first lifecycle prototype. Genesis Forge can bind a unique Agentmon from transient working examples, continue training it without changing DNA, calculate an evidence-based level, and request evolution through the same signed engine gate used by the CLI. Packaged Apple Silicon and Windows x64 builds include their own checksum-verified Node runtime and Agentmon engine, so a friend does not need this repository or a developer toolchain.

## Foundation loops

1. **Observe** — accept only explicitly submitted user examples.
2. **Derive** — discard raw text after creating bounded observations, evidence digests, skill candidates, and loops.
3. **Prove** — keep procedures non-executable until canonical provenance, trainer confirmation, and arena proof agree.
4. **Route** — apply only semantically relevant, proven procedures; otherwise use identity-only fallback.
5. **Measure** — record one-time helped/missed/retry outcomes separately from proof.
6. **Evolve** — mutate permanent DNA only after the engine verifies ownership, inherited and acquired branches, and a new fusion move.

`SKILL.md` is generated from the sealed state. Editing the markdown cannot change the state root, DNA, ownership, or marketplace eligibility.

## What is interactive

- Switch between the uncluttered Work and Home views.
- Switch the Work canvas between Chat and Code.
- Open the project menu without exposing rooms or squad clutter.
- See the truly attached Agentmon in the compact lower-right dock.
- Load Guardot's complete identity and actual `SKILL.md` from `.agentmon/roster/main`.
- Route the same Agentmon identity through a local runtime, Venice, OpenAI, or Gemini without copying a system prompt.
- Auto-detect Ollama, LM Studio, vLLM, SGLang, LocalAI/llama.cpp, Jan, and Text Generation WebUI runtimes.
- Keep Agentmon Mode on for automatic identity and proven-skill routing, or turn it off for an honest same-provider generic baseline.
- Record Helped, Missed, or Retry on eligible responses. The one-time receipt stores only a task digest, matched procedure IDs, provider/model identifiers, and the selected outcome.
- Store Venice, OpenAI, and Gemini API keys in macOS Keychain or Windows Credential Manager. The local companion and project files never persist provider credentials.
- Keep conversation context in application memory only and persist only raw-free derived training evidence.
- Verify that relevant tasks receive only arena-proven procedures and unrelated tasks fall back to the identity lens.
- View Guardot's Home in the same application and preview its local lighting state.
- Hatch and train a personal Agentmon in **Home → Genesis Forge** using transient examples.
- See a derived level, hatch readiness, skill/loop counts, generation, and the six foundation loops.
- Attempt evolution through an engine-enforced gate; the UI cannot bypass lineage or fusion requirements.
- Use Home as the always-visible Agentmon dashboard. It consolidates permanent identity and resonance, DNA and lineage, hatch evidence, observed trainer patterns, capability maturity, procedure validation, arena results, usefulness, connection state, and privacy boundaries from the real local V4 roster.
- Run the real setup actions directly from Home: start or stop the companion, copy its pairing code, prepare the verified Chrome extension, open Chrome Extensions, and install or inspect the Codex plugin.
- Start and stop the existing loopback companion from the same app, copy its one-time Chrome pairing code, and inspect live paired-site, prompt-count, and active-downlink status from both Work and Home.

The app never fabricates an LLM response. Chat remains disabled until a real provider is connected. Genesis Forge accepts deliberate training examples, but only the engine can write derived state or regenerate `SKILL.md`.

## Agentmon model aggregator

1. Choose **Local**, **Venice**, **OpenAI**, or **Gemini**.
2. For Local, start an OpenAI-compatible runtime and press **Scan This Device**. For a cloud provider, enter an API key and press **Save Key + Load Models**.
3. Choose a model and press **Connect**.
4. Leave **Agentmon Mode** on and chat normally. Guardot's identity and relevant arena-proven procedures are applied automatically on every turn.
5. After an eligible response, press **Helped**, **Missed**, or **Retry** to add raw-free usefulness evidence.

No activation command or copied system prompt is required. Custom model URLs remain loopback-only; Venice, OpenAI, and Gemini use fixed official endpoints. Venice models are discovered from the account instead of hardcoding a possibly unavailable model name, and Venice's additional system prompt is disabled so the selected Agentmon identity remains the sole system instruction. Agentmon does not persist raw prompts, raw responses, or conversation history. The selected provider has its own retention behavior, which Agentmon cannot control. Cloud prompts go directly to the selected provider and never to an Agentmon server.

## Run from source

```sh
npm install
npm run dev
```

## Build the desktop app

```sh
npm run check
npm run build
```

The app bundle is written to `src-tauri/target/release/bundle/macos/Agentmon Home.app`.

The release workflow targets Apple Silicon Macs and Windows x64 PCs. Run `npm run prepare:runtime` before a source build to fetch and verify the correct embedded Node runtime. A local model is optional for hatching and training; chat requires Ollama, LM Studio, another loopback OpenAI-compatible runtime, or an explicitly configured cloud provider. Cloud keys use the native secure credential vault on both platforms.
