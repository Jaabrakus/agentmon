#!/usr/bin/env node
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createLocalVault } from "../lib/privacy/local-vault.mjs";

export async function migrateFeedToVault(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = options.slot || "main";
  const source = resolve(options.file || resolve(rootDir, ".agentmon/feeds", `${slot}.json`));
  const feed = JSON.parse(await readFile(source, "utf8"));
  if (feed?.format !== "agentmon.feed/v1" || feed?.consent?.scope !== "user_prompts_only") throw new Error("Legacy feed is not a consent-scoped agentmon.feed/v1 document.");
  const vault = options.vault || createLocalVault(rootDir, options.vaultOptions);
  const destination = await vault.writeJson(`feeds/${slot}`, feed);
  const verified = await vault.readJson(`feeds/${slot}`);
  if (verified.revision !== feed.revision || verified.prompts?.length !== feed.prompts?.length) throw new Error("Encrypted feed verification failed; plaintext was preserved.");
  if (options.removePlaintext) await unlink(source);
  return { slot, destination, prompts: feed.prompts.length, plaintextRemoved: Boolean(options.removePlaintext), source };
}

function parseArgs(argv) {
  const options = { rootDir: process.cwd(), slot: "main", file: null, removePlaintext: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--cwd") options.rootDir = resolve(argv[++index]);
    else if (argv[index] === "--slot") options.slot = argv[++index];
    else if (argv[index] === "--file") options.file = resolve(argv[++index]);
    else if (argv[index] === "--remove-plaintext") options.removePlaintext = true;
    else throw new Error(`Unknown migration option: ${argv[index]}`);
  }
  return options;
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  migrateFeedToVault(parseArgs(process.argv.slice(2))).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
