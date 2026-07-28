# Start with Agentmon Home

## 1. Install the big app

### Apple Silicon Mac

Download `Agentmon-Home-v0.19.0-macOS-Apple-Silicon.zip`, unzip it, and drag **Agentmon Home.app** into Applications. This friend beta is ad-hoc signed but not Apple-notarized, so Control-click the app and choose **Open** the first time.

### Windows x64

Open this repository's **Releases** page and download either the Agentmon Home setup `.exe` or `.msi` attached to `agentmon-v0.19.0`. Run the installer. Until Authenticode signing is added, Windows may show SmartScreen; choose **More info → Run anyway** only if the download came from this repository.

## 2. Hatch your Agentmon

Open **Home → Genesis Forge**, enter at least five real examples of how you approach work, and press **Incubate Signal**. Keep adding varied examples through **Train Derived Traits** until hatch readiness reaches 100%.

The name, archetype, resonance, DNA, palette, and pixel creature are generated from the derived signal. Training can grow skills and levels but cannot silently rewrite permanent DNA.

## 3. Add a model brain

Hatching does not require an LLM. For private chat, install Ollama, run `ollama pull qwen3:4b-instruct`, then use **Work → Scan This Mac/PC → Connect**. Other loopback OpenAI-compatible runtimes are also supported.

For Venice, choose **Venice · Cloud**, paste a newly created Venice API key, and press **Save Key + Load Models**. Pick one of the text models returned for your account and connect. The key is saved only in macOS Keychain or Windows Credential Manager; it is never written into the Agentmon project or database.

## 4. Add the Chrome companion

1. Download and unzip `Agentmon-Chrome-v0.8.0.zip`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the unzipped `Agentmon-Chrome-v0.8.0` folder.
4. In Agentmon Home, open **Home**, start the local companion, and copy its one-time pairing code.
5. Open the extension, enter the code, and explicitly enable only the LLM sites you want it to observe.

The extension observes submitted prompts only. It does not collect drafts, model answers, unrelated tabs, or raw page content. The local engine persists derived traits and evidence digests, not raw prompts or chat history.

## Beta boundary

Evolution is deliberately locked until legitimate inherited and acquired branches can produce a new fusion move. Marketplace transfer/import screens and production signing are the next release layer.
