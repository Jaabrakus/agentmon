#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createLocalVault } from "../lib/privacy/local-vault.mjs";
import { visualLifecycle } from "../lib/visual/incubation-lifecycle.mjs";
import { readAgentmonSnapshot } from "./agentmon-db.mjs";
import { startAgentmonDaemon } from "./agentmon-daemon.mjs";
import { generateVisuals } from "./agentmon-visual.mjs";

function parseArgs(argv) {
  const options = { rootDir: process.cwd(), slot: "main", port: 4765 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--cwd") options.rootDir = resolve(argv[++index]);
    else if (argv[index] === "--slot") options.slot = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
    else throw new Error(`Unknown companion option: ${argv[index]}`);
  }
  return options;
}

export async function startCompanion(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = options.slot || "main";
  const vault = options.vault || createLocalVault(rootDir, options.vaultOptions);
  await vault.writeJson("runtime/status", { format: "agentmon.companion-private-status/v1", initializedAt: new Date().toISOString(), rawPromptsIncluded: false });
  const daemon = await startAgentmonDaemon({ rootDir, port: options.port ?? 4765, vault, localModelConfig: options.localModelConfig });
  const agentmon = await readAgentmonSnapshot(rootDir, slot);
  const lifecycle = visualLifecycle(agentmon);
  const visuals = agentmon ? await generateVisuals({ rootDir, slot }) : null;
  const visualPath = lifecycle.stage === "egg" ? visuals?.paths.egg : lifecycle.stage === "hatched" ? visuals?.paths.creature : null;
  const status = {
    format: "agentmon.companion-status/v1",
    state: lifecycle.stage,
    readiness: lifecycle.score,
    signalBrightness: lifecycle.brightness,
    slot,
    daemon: `http://${daemon.host}:${daemon.port}`,
    visualPath,
    vault: "AES-256-GCM; key stored in OS keychain or supplied by AGENTMON_VAULT_KEY",
    connectors: ["browser-extension", "codex", "antigravity", "kimi", "chatgpt-export", "adapter-api"],
    rawPromptsLeaveDevice: false,
  };
  const statusPath = join(rootDir, ".agentmon", "companion-status.json");
  await mkdir(resolve(rootDir, ".agentmon"), { recursive: true, mode: 0o700 });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
  return { daemon, status, statusPath, close: () => daemon.close() };
}

async function main() {
  const companion = await startCompanion(parseArgs(process.argv.slice(2)));
  process.stdout.write(`Agentmon companion is ON\nState: ${companion.status.state}\nVisual: ${companion.status.visualPath ?? `procedural signal light (${companion.status.signalBrightness}% brightness)`}\nBrowser pairing code: ${companion.daemon.browserPairingCode}\nBrowser retention: derived-only (raw prompts are discarded)\nVault: encrypted locally for explicit import workflows only\nDaemon: ${companion.status.daemon}\nPress Ctrl+C to stop.\n`);
  const stop = () => void companion.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) main().catch((error) => { process.stderr.write(`Agentmon companion failed: ${error.message}\n`); process.exitCode = 1; });
