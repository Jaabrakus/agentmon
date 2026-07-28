#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { arch, totalmem } from "node:os";
import { resolve } from "node:path";
import { createLocalModelProvider, localModelConfigFromEnv } from "../lib/local-model-provider.mjs";
import { databaseStatus } from "./agentmon-db.mjs";

function executableStatus(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 3_000 });
  return { installed: !result.error && result.status === 0, version: !result.error && result.status === 0 ? String(result.stdout || result.stderr).trim().slice(0, 200) : null };
}

async function main() {
  const rootDir = resolve(process.cwd());
  const tokenPath = resolve(rootDir, ".agentmon/daemon-token");
  const config = localModelConfigFromEnv();
  const provider = createLocalModelProvider(config);
  const localModel = await provider.status();
  const database = await databaseStatus(rootDir);
  const tokenMode = existsSync(tokenPath) ? statSync(tokenPath).mode & 0o777 : null;
  const report = {
    format: "agentmon.doctor/v1",
    platform: { architecture: arch(), memoryGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10, node: process.version },
    storage: {
      mode: "local-plaintext-feed",
      database: database.path,
      schemaVersion: database.schemaVersion,
      rawFeedCloudSync: false,
      encryptedAtRest: false,
    },
    daemon: { binding: "loopback-only", tokenPath, tokenExists: existsSync(tokenPath), tokenOwnerOnly: tokenMode === null ? null : (tokenMode & 0o077) === 0 },
    runtimes: { ollama: executableStatus("ollama"), llamaCpp: executableStatus("llama-server"), mlxLm: executableStatus("mlx_lm.server") },
    localModel: { configured: Boolean(config.model), ...localModel, baseUrl: config.baseUrl },
    authority: { localModelMode: "shadow", mayMutateSkills: false, mayChangeDNA: false, trainerApprovalRequired: true },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Agentmon doctor failed: ${error.message}\n`);
  process.exitCode = 1;
});
