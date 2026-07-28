import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export const PINNED_PIXEL_SNAPPER = Object.freeze({
  version: "1.0.0",
  binarySha256: "2d00ed511654dfb912b2c963876d836802933b2333aa78104cecd75fd4626a32",
  sourceSha256: Object.freeze({
    "Cargo.toml": "387a7cd0c75530a51330ba4d68b0ba2e58bc4a5187a41d2c166c0dedb75752b3",
    "Cargo.lock": "d349974f31866473e88270dc9b2ad19c3e2e3711c8e2756151be18fb24a5e60f",
    "src/lib.rs": "08c1323a65243400a4a6ce7ac0051ad116e39869f3276630c2a16a02cc2e05b4",
    "src/main.rs": "b1b0e0c4dfd4f8d015cfa244b91f6c8cc3c232713ee2f3fa32de2fa23f2dda1b",
  }),
});

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function assertDigest(path, expected, label) {
  const actual = sha256(await readFile(path));
  if (actual !== expected) throw new Error(`Pixel Snapper integrity failure for ${label}: expected ${expected}, received ${actual}.`);
  return actual;
}

export async function verifyPixelSnapperInstallation({ binaryPath, sourceRoot }) {
  await access(SANDBOX_EXEC).catch(() => { throw new Error("Pixel Snapper isolation is unavailable: /usr/bin/sandbox-exec was not found."); });
  const files = {};
  for (const [name, digest] of Object.entries(PINNED_PIXEL_SNAPPER.sourceSha256)) {
    files[name] = await assertDigest(resolve(sourceRoot, name), digest, name);
  }
  const binarySha256 = await assertDigest(binaryPath, PINNED_PIXEL_SNAPPER.binarySha256, basename(binaryPath));
  return {
    status: "verified",
    version: PINNED_PIXEL_SNAPPER.version,
    binarySha256,
    files,
    isolation: "macos-sandbox-exec",
    network: "denied",
    userHomeRead: "denied",
    externalVolumesRead: "denied",
    environment: "minimal-no-secrets",
  };
}

function assertInside(path, parent, label) {
  const child = relative(resolve(parent), resolve(path));
  if (!child || child.startsWith("..") || child.startsWith("/")) throw new Error(`${label} must be inside the isolated Pixel Snapper directory.`);
}

export function pixelSnapperSandboxProfile() {
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(deny file-read* (subpath \"/Users\"))",
    "(deny file-write* (subpath \"/Users\"))",
    "(deny file-read* (subpath \"/Volumes\"))",
    "(deny file-write* (subpath \"/Volumes\"))",
  ].join("\n");
}

export async function createPixelSnapperRunner({ binaryPath, sourceRoot }) {
  const integrity = await verifyPixelSnapperInstallation({ binaryPath, sourceRoot });
  return {
    integrity,
    async process(sprite, profile) {
      const outputs = await this.processBatch([{ id: "sprite", buffer: sprite }], profile);
      return outputs.get("sprite");
    },
    async processBatch(sprites, profile) {
      if (!Array.isArray(sprites) || sprites.length === 0) throw new Error("Pixel Snapper batch requires at least one sprite.");
      const temporary = await mkdtemp(join(tmpdir(), "agentmon-pixel-snapper-"));
      const tool = resolve(temporary, "pixel-snapper");
      const input = resolve(temporary, "input");
      const output = resolve(temporary, "output");
      try {
        for (const [path, label] of [[tool, "tool"], [input, "input"], [output, "output"]]) assertInside(path, temporary, label);
        await copyFile(binaryPath, tool);
        await chmod(tool, 0o500);
        await assertDigest(tool, integrity.binarySha256, "staged binary");
        await mkdir(input, { mode: 0o700 });
        await mkdir(output, { mode: 0o700 });
        for (const sprite of sprites) {
          if (!/^[a-z0-9-]+$/.test(sprite.id)) throw new Error(`Unsafe Pixel Snapper sprite id: ${sprite.id}`);
          await writeFile(resolve(input, `${sprite.id}.png`), sprite.buffer, { mode: 0o400 });
        }
        await execFileAsync(SANDBOX_EXEC, [
          "-p", pixelSnapperSandboxProfile(), tool, input, output, String(profile.paletteColors), "--pixel-size", String(profile.pixelSize),
        ], {
          cwd: temporary,
          env: { PATH: "/usr/bin:/bin", TMPDIR: temporary, LANG: "C" },
          maxBuffer: 1_048_576,
          timeout: 120_000,
          killSignal: "SIGKILL",
        });
        const results = new Map();
        for (const sprite of sprites) results.set(sprite.id, await readFile(resolve(output, `${sprite.id}.png`)));
        return results;
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
  };
}
