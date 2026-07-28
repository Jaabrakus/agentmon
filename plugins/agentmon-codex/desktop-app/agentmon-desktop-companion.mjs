#!/usr/bin/env node
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { startDesktopBrowserServer } from "./desktop-browser-server.mjs";

function parseArgs(argv) {
  const options = { rootDir: process.cwd(), engineRoot: null, slot: "main", port: 4765 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--cwd") options.rootDir = resolve(argv[++index]);
    else if (argv[index] === "--engine-root") options.engineRoot = resolve(argv[++index]);
    else if (argv[index] === "--slot") options.slot = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
    else throw new Error(`Unknown desktop companion option: ${argv[index]}`);
  }
  return options;
}

async function existingEgg(rootDir, slot) {
  const candidates = [
    resolve(rootDir, `.agentmon/roster/${slot}/visual/creature.png`),
    resolve(rootDir, `.agentmon/incubator/${slot}/egg.png`),
    resolve(rootDir, "public/agentmon-sprites/egg-0.png"),
  ];
  for (const path of candidates) {
    try { await access(path); return path; } catch {}
  }
  return null;
}

const options = parseArgs(process.argv.slice(2));
startDesktopBrowserServer({ ...options, engineRoot: options.engineRoot || options.rootDir }).then(async (server) => {
  process.stdout.write(`Agentmon desktop companion is ON\nBrowser pairing code: ${server.pairingCode}\nDesktop token: ${server.token}\nBrowser retention: derived-only (raw prompts are discarded)\nDaemon: http://${server.host}:${server.port}\n`);
  void existingEgg(server.rootDir, options.slot).then((eggPath) => { if (eggPath) process.stdout.write(`Egg: ${eggPath}\n`); });
  const stop = () => void server.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}).catch((error) => {
  process.stderr.write(`Agentmon desktop companion failed: ${error.message}\n`);
  process.exitCode = 1;
});
