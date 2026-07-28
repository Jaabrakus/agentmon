import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  createPixelSnapperRunner,
  PINNED_PIXEL_SNAPPER,
  pixelSnapperSandboxProfile,
  verifyPixelSnapperInstallation,
} from "../lib/visual/pixel-snapper-security.mjs";

const execFileAsync = promisify(execFile);
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(pluginRoot, "../..");
const sourceRoot = resolve(projectRoot, "spritefusion-pixel-snapper-main");
const binaryPath = resolve(sourceRoot, "target/release/spritefusion-pixel-snapper");

test("pins reviewed Pixel Snapper source and binary before processing", async () => {
  const result = await verifyPixelSnapperInstallation({ binaryPath, sourceRoot });
  assert.equal(result.status, "verified");
  assert.equal(result.binarySha256, PINNED_PIXEL_SNAPPER.binarySha256);
  assert.equal(result.network, "denied");
  assert.equal(result.userHomeRead, "denied");
  assert.equal(Object.keys(result.files).length, 4);
});

test("fails closed when reviewed Pixel Snapper source changes", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "agentmon-snapper-tamper-"));
  try {
    await mkdir(resolve(temporary, "src"), { recursive: true });
    await writeFile(resolve(temporary, "Cargo.toml"), "tampered\n");
    await assert.rejects(
      verifyPixelSnapperInstallation({ binaryPath, sourceRoot: temporary }),
      /integrity failure for Cargo\.toml/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("sandbox denies project reads and processes only a staged temporary sprite", async () => {
  await assert.rejects(
    execFileAsync("/usr/bin/sandbox-exec", ["-p", pixelSnapperSandboxProfile(), "/bin/cat", resolve(projectRoot, "package.json")]),
    /Operation not permitted|operation not permitted|denied/,
  );
  const runner = await createPixelSnapperRunner({ binaryPath, sourceRoot });
  const input = await readFile(resolve(pluginRoot, "assets/visual-v4/species/vault.png"));
  const output = await runner.process(input, { pixelSize: 2, paletteColors: 160 });
  assert.deepEqual([...output.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
