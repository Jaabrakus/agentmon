#!/usr/bin/env node
import { chmod, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(sourceDir, "../../..");
const buildRoot = resolve(process.env.AGENTMON_BUILD_ROOT || "/private/tmp/agentmon-desktop-build");
const appRoot = resolve(buildRoot, "Agentmon.app");
const sourceSnapshot = resolve(buildRoot, "Sources");
const distributionRoot = resolve(process.env.AGENTMON_DISTRIBUTION_ROOT || resolve(projectRoot, "dist/Agentmon.app"));
const contents = resolve(appRoot, "Contents");
const executable = resolve(contents, "MacOS/Agentmon");

await rm(appRoot, { recursive: true, force: true });
await rm(sourceSnapshot, { recursive: true, force: true });
await mkdir(resolve(contents, "MacOS"), { recursive: true });
await mkdir(resolve(contents, "Resources"), { recursive: true });
await mkdir(sourceSnapshot, { recursive: true });
const swiftSources = ["AgentmonController.swift", "AgentmonController+Browser.swift", "AgentmonController+CodexPlugin.swift", "AgentmonController+LocalModel.swift", "AgentmonController+Marketplace.swift", "AgentmonController+PixelSnap.swift", "AgentmonViews.swift", "AgentmonPanels.swift", "AgentmonDesktop.swift"];
for (const name of swiftSources) {
  await copyFile(resolve(sourceDir, name), resolve(sourceSnapshot, name));
}
await copyFile(resolve(sourceDir, "Info.plist"), resolve(contents, "Info.plist"));
await copyFile(resolve(sourceDir, "agentmon-desktop-companion.mjs"), resolve(contents, "Resources/agentmon-desktop-companion.mjs"));
await copyFile(resolve(sourceDir, "desktop-browser-server.mjs"), resolve(contents, "Resources/desktop-browser-server.mjs"));
await copyFile(resolve(sourceDir, "desktop-model-provider-routes.mjs"), resolve(contents, "Resources/desktop-model-provider-routes.mjs"));
await copyFile(resolve(sourceDir, "desktop-marketplace-service.mjs"), resolve(contents, "Resources/desktop-marketplace-service.mjs"));
await copyFile(resolve(sourceDir, "desktop-action-routes.mjs"), resolve(contents, "Resources/desktop-action-routes.mjs"));
await copyFile(resolve(sourceDir, "desktop-downlink-service.mjs"), resolve(contents, "Resources/desktop-downlink-service.mjs"));
await copyFile(resolve(projectRoot, "public/agentmon-sprites/genesis-egg-v2.png"), resolve(contents, "Resources/agentmon-premium-egg.png"));
await cp(resolve(projectRoot, "plugins/agentmon-codex/browser-extension"), resolve(contents, "Resources/browser-extension"), { recursive: true });
const sharpModuleRoot = resolve(process.env.AGENTMON_SHARP_BUNDLE_ROOT || resolve(projectRoot, "node_modules"));
for (const module of ["sharp", "detect-libc", "semver", "@img/colour", "@img/sharp-darwin-arm64", "@img/sharp-libvips-darwin-arm64"]) {
  const destination = resolve(contents, "Resources/node_modules", module);
  await mkdir(destination, { recursive: true });
  // File Provider can expose conflicted duplicate files and transient .BC files
  // while a package is copied. They are not runtime assets and can invalidate
  // an otherwise correct app signature, so copy only the canonical module tree.
  const copyModule = spawnSync("/usr/bin/rsync", [
    "-a",
    "--exclude", ".DS_Store",
    "--exclude", "._*",
    "--exclude", ".BC.*",
    "--exclude", "* 2.*",
    `${resolve(sharpModuleRoot, module)}/`,
    `${destination}/`,
  ], { stdio: "inherit" });
  if (copyModule.status !== 0) process.exit(copyModule.status || 1);
}
// npm's development-only executable link may point outside the bundle, which
// is unnecessary at runtime and invalidates strict macOS code signing.
await rm(resolve(contents, "Resources/node_modules/sharp/node_modules/.bin"), { recursive: true, force: true });
await writeFile(resolve(contents, "PkgInfo"), "APPL????");

const compile = spawnSync("/usr/bin/swiftc", [
  "-parse-as-library", "-O",
  ...swiftSources.map((name) => resolve(sourceSnapshot, name)),
  "-o", executable, "-framework", "SwiftUI", "-framework", "AppKit",
], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status || 1);
await chmod(executable, 0o755);

const cleanAttributes = spawnSync("/usr/bin/xattr", ["-cr", appRoot], { stdio: "inherit" });
if (cleanAttributes.status !== 0) process.exit(cleanAttributes.status || 1);
spawnSync("/usr/bin/xattr", ["-d", "com.apple.FinderInfo", appRoot], { stdio: "ignore" });
spawnSync("/usr/bin/xattr", ["-d", "com.apple.fileprovider.fpfs#P", appRoot], { stdio: "ignore" });
const sign = spawnSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", appRoot], { stdio: "inherit" });
if (sign.status !== 0) process.exit(sign.status || 1);
await rm(distributionRoot, { recursive: true, force: true });
await mkdir(dirname(distributionRoot), { recursive: true });
const distribute = spawnSync("/usr/bin/ditto", [appRoot, distributionRoot], { stdio: "inherit" });
if (distribute.status !== 0) process.exit(distribute.status || 1);
let distributionVerified = false;
for (let attempt = 1; attempt <= 3 && !distributionVerified; attempt += 1) {
  const cleanDistribution = spawnSync("/usr/bin/xattr", ["-cr", distributionRoot], { stdio: "inherit" });
  const signDistribution = cleanDistribution.status === 0
    ? spawnSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", distributionRoot], { stdio: "inherit" })
    : cleanDistribution;
  // File Provider may reattach Finder metadata while codesign walks the bundle.
  const cleanSignedDistribution = signDistribution.status === 0
    ? spawnSync("/usr/bin/xattr", ["-cr", distributionRoot], { stdio: "inherit" })
    : signDistribution;
  const verifyDistribution = cleanSignedDistribution.status === 0
    ? spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", distributionRoot], { stdio: "inherit" })
    : cleanSignedDistribution;
  distributionVerified = verifyDistribution.status === 0;
}
if (!distributionVerified) process.exit(1);
process.stdout.write(`Built ${distributionRoot}\nSigned staging bundle: ${appRoot}\n`);
