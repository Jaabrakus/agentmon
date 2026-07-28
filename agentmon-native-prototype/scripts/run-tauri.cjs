#!/usr/bin/env node

const args = process.argv.slice(2);

function loadCli() {
  if (process.platform === "darwin" && process.arch === "arm64") return require("@tauri-apps/cli-darwin-arm64");
  if (process.platform === "darwin" && process.arch === "x64") return require("@tauri-apps/cli-darwin-x64");
  const portable = require("@tauri-apps/cli");
  if (typeof portable.run === "function") return portable;
  throw new Error(`The Tauri CLI binding is unavailable for ${process.platform}-${process.arch}.`);
}

try {
  const cli = loadCli();
  cli.run(args, "tauri", (error) => {
    if (!error) return;
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
