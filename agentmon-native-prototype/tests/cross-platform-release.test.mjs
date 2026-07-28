import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import test from "node:test";

const project = resolve(import.meta.dirname, "..");
const repository = resolve(project, "..");

test("the friend release has real Apple Silicon and Windows build paths", async () => {
  const windows = JSON.parse(await readFile(resolve(project, "src-tauri/tauri.windows.conf.json"), "utf8"));
  const macos = JSON.parse(await readFile(resolve(project, "src-tauri/tauri.macos.conf.json"), "utf8"));
  const rust = await readFile(resolve(project, "src-tauri/src/main.rs"), "utf8");
  const runtime = await readFile(resolve(project, "scripts/prepare-runtime.mjs"), "utf8");
  const workflow = await readFile(resolve(repository, ".github/workflows/agentmon-desktop-release.yml"), "utf8");
  const downloads = await readFile(resolve(repository, "release-kit/latest/README.md"), "utf8");

  assert.deepEqual(windows.bundle.targets, ["nsis", "msi"]);
  assert.equal(windows.bundle.resources["bin/node.exe"], "bin/node.exe");
  assert.equal(macos.bundle.resources["bin/node"], "bin/node");
  assert.match(rust, /LOCALAPPDATA/);
  assert.match(rust, /resources\.join\("bin\/node\.exe"\)/);
  assert.match(runtime, /SHASUMS256\.txt/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /aarch64-apple-darwin/);
  assert.match(downloads, /Agentmon-Home-v0\.19\.0-macOS-Apple-Silicon\.zip/);

  const macZip = resolve(repository, "release-kit/latest/Agentmon-Home-v0.19.0-macOS-Apple-Silicon.zip");
  const extensionZip = resolve(repository, "release-kit/latest/Agentmon-Chrome-v0.8.0.zip");
  await Promise.all([access(macZip), access(extensionZip)]);
  assert.ok((await stat(macZip)).size > 10_000_000);
  assert.ok((await stat(extensionZip)).size > 100_000);

  const checksums = await readFile(resolve(repository, "release-kit/latest/RELEASE-CHECKSUMS.sha256"), "utf8");
  for (const archive of [macZip, extensionZip]) {
    const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
    assert.match(checksums, new RegExp(`${digest}  ${basename(archive)}`));
  }
});
