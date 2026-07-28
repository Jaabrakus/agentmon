# Agentmon Local Browser Companion

Version 0.8.0 connects the extension to the marketplace without turning Chrome into a wallet. The popup shows only redacted verified/listed state and can bring Agentmon Home forward; pairing tokens, authority operations, listings, and ownership controls remain in the local desktop app.

Version 0.7.1 makes the safe router state explicit in the page receipt: a proven procedure is shown only after a semantic match; otherwise the complete Agentmon identity remains active while the skill router visibly stays out.

This Manifest V3 extension observes only prompts the trainer explicitly submits on an enabled LLM website. It does not listen to input events, collect drafts, collect model responses, inspect other tabs, or send prompt text to a cloud service.

The popup mirrors the local incubation lifecycle: Signal Light, species-bound egg, then hatched Agentmon. Signal brightness is derived from readiness metadata returned by the loopback companion; no raw prompt text is retained by the extension.

Supported origins: ChatGPT, Claude, Gemini, Kimi, and Venice (`venice.ai`). Each origin is optional and must be enabled separately.

After pairing, the popup shows the current permanent form, local skill count, arena proof count, active capture state, and the next step in the five-part first-win journey. When Agentmon Mode matches a proven skill, a persistent in-page receipt names the procedures used and offers one-click **Helped**/**Missed** feedback. The receipt never reads or stores the model response; the trainer supplies the outcome explicitly.

## Agentmon downlink commands

Submit `/agentmon use main` in an enabled chat to activate the main roster Agentmon for that browser conversation. The command is intercepted locally and is not sent to the LLM. Future submitted prompts in that conversation are prefixed with a raw-free packet containing the Agentmon identity and trainer-approved procedures. Submit `/agentmon off` to stop injection.

Downlink is explicit per conversation, memory-only, and visible in the desktop intake ledger. It never injects raw prompt history, memories, credentials, unapproved procedures, or executable resources. The original user prompt—not the injected packet—is what the training engine analyzes.

The popup toggle enables automatic routing for the current tab, so slash commands are optional. The five-step journey is: connect, train, hatch, activate, and measure a first real outcome.

## Local test install

1. From the PokemonLLM project, run `npm run agentmon:companion`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select this `browser-extension` directory.
4. Open the extension, enter the one-time pairing code printed by the companion, and enable access for the current supported site.
5. Submit prompts normally. The extension sends each submitted prompt to `127.0.0.1:4765`, where it is analyzed in memory and discarded.

The popup reports `EXTENSION CONNECTED` separately from `<site> · prompt capture on`. Pairing does not grant access to any LLM website; each site still requires its own explicit permission.

## Retention contract

- Raw prompt text: transient memory only.
- Browser storage: scoped pairing token only.
- Agentmon state: raw-free observations, digests, counters, traits, and skill evidence on the local device.
- Cloud transfer: none.
- Downlink context: trainer-approved, raw-free procedures only; opt-in per conversation.
- Site permission: optional and revocable independently for each supported origin.

The browser connector cannot call the private vault, roster, local-model, or general adapter endpoints. Restarting the companion invalidates the in-memory browser token and requires a new pairing code.
