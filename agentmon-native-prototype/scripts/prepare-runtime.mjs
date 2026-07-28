#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const nodeVersion = "v22.13.1";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const runtimeTarget = process.env.AGENTMON_RUNTIME_TARGET || `${process.platform}-${process.arch}`;
const targets = {
  "darwin-arm64": {
    archive: `node-${nodeVersion}-darwin-arm64.tar.gz`,
    binary: `node-${nodeVersion}-darwin-arm64/bin/node`,
    destination: "node",
    extractor: "tar",
  },
  "win32-x64": {
    archive: `node-${nodeVersion}-win-x64.zip`,
    binary: `node-${nodeVersion}-win-x64/node.exe`,
    destination: "node.exe",
    extractor: "powershell",
  },
};

const target = targets[runtimeTarget];
if (!target) {
  throw new Error(`Unsupported Agentmon runtime target: ${runtimeTarget}. Supported targets: ${Object.keys(targets).join(", ")}.`);
}

const destination = join(appRoot, "src-tauri", "bin", target.destination);
if (runtimeTarget === `${process.platform}-${process.arch}`) {
  const current = spawnSync(destination, ["--version"], { encoding: "utf8" });
  if (current.status === 0 && current.stdout.trim() === nodeVersion) {
    process.stdout.write(`Agentmon bundled runtime already ready: ${runtimeTarget} ${nodeVersion}\n`);
    process.exit(0);
  }
}

const temporary = await mkdtemp(join(tmpdir(), "agentmon-node-runtime-"));
try {
  const baseUrl = `https://nodejs.org/dist/${nodeVersion}`;
  const [archiveResponse, sumsResponse] = await Promise.all([
    fetch(`${baseUrl}/${target.archive}`),
    fetch(`${baseUrl}/SHASUMS256.txt`),
  ]);
  if (!archiveResponse.ok) throw new Error(`Node runtime download failed with HTTP ${archiveResponse.status}.`);
  if (!sumsResponse.ok) throw new Error(`Node checksum download failed with HTTP ${sumsResponse.status}.`);

  const archiveBytes = Buffer.from(await archiveResponse.arrayBuffer());
  const sums = await sumsResponse.text();
  const expected = sums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, filename]) => filename === target.archive)?.[0];
  if (!expected) throw new Error(`The official Node checksum list does not contain ${target.archive}.`);
  const actual = createHash("sha256").update(archiveBytes).digest("hex");
  if (actual !== expected) throw new Error(`Node runtime checksum mismatch for ${target.archive}.`);

  const archivePath = join(temporary, target.archive);
  const extractedPath = join(temporary, "extracted");
  await writeFile(archivePath, archiveBytes);
  await mkdir(extractedPath);

  const extraction = target.extractor === "tar"
    ? spawnSync("tar", ["-xzf", archivePath, "-C", extractedPath], { stdio: "inherit" })
    : process.platform === "win32"
      ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive", "-LiteralPath", archivePath, "-DestinationPath", extractedPath, "-Force"], { stdio: "inherit" })
      : spawnSync("unzip", ["-q", archivePath, "-d", extractedPath], { stdio: "inherit" });
  if (extraction.status !== 0) throw new Error(`Could not extract ${target.archive}.`);

  const runtime = join(extractedPath, target.binary);
  await readFile(runtime);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(runtime, destination);
  if (runtimeTarget.startsWith("darwin-")) await chmod(destination, 0o755);
  process.stdout.write(`Prepared checksum-verified Agentmon runtime: ${runtimeTarget} ${nodeVersion}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
