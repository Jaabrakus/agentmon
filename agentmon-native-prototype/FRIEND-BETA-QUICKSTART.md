# Agentmon Home — Friend Beta

This is a local-first macOS Apple Silicon and Windows x64 prototype. Its lifecycle engine and runtime are inside the app; the repository and a developer toolchain are not required.

## Start here

1. On macOS, drag **Agentmon Home.app** into Applications. Because this friend beta is not Apple-notarized yet, Control-click it and choose **Open** on first launch.
2. On Windows, run the attached setup `.exe` or `.msi`. Because the beta is not Authenticode-signed yet, Windows may require **More info → Run anyway**.
3. Open **Home → Genesis Forge**.
4. Enter at least five real examples of how you approach work, one per line. Press **Incubate Signal**.
5. Continue with varied examples and press **Train Derived Traits** until hatch readiness reaches 100%.
6. Open **Work**. For private on-device chat, install Ollama and run `ollama pull qwen3:4b-instruct`, then use **Scan This Device → Connect**. Hatching itself does not require a model.

## What is real in this build

- **Observe:** only examples you deliberately submit are read.
- **Derive:** raw examples are discarded after bounded traits, evidence digests, and candidates are created.
- **Prove:** a skill cannot execute merely because someone edits `SKILL.md`; proof and canonical provenance must agree.
- **Route:** relevant proven skills are applied automatically; otherwise the Mon uses identity only.
- **Measure:** Helped/Missed/Retry records one-time, raw-free usefulness evidence when an eligible proven skill ran.
- **Evolve:** DNA changes only through the engine gate after legitimate inherited and acquired branches can produce a new fusion move.

Each DNA seed generates its own name, archetype, resonance, color palette, and pixel creature. Training grows skills and levels without changing permanent DNA.

## Privacy and integrity

Agentmon stores its roster locally in `~/Library/Application Support/Agentmon/Habitat/.agentmon`. It does not persist raw prompts, model replies, or chat history. A local model receives prompts over loopback; a selected cloud provider receives prompts directly under that provider's retention policy.

`SKILL.md` is an export generated from sealed state. Hand edits do not change DNA, provenance, ownership, or verified trade eligibility. Evolution staying locked until its lineage requirements exist is intentional.

## Beta boundary

The macOS package is ad-hoc code-signed for integrity but is not yet Developer ID signed or notarized by Apple. The Windows installer is not yet Authenticode-signed. Marketplace transfer/import screens and the authoritative trade registry are the next layer; this beta establishes the local lifecycle and verification foundation they require.
