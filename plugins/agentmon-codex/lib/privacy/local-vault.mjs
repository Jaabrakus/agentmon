import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
export const VAULT_FORMAT = "agentmon.encrypted-envelope/v1";
const KEYCHAIN_SERVICE = "agentmon.local-vault";

function projectAccount(rootDir) {
  return `project-${createHash("sha256").update(resolve(rootDir)).digest("hex").slice(0, 24)}`;
}

function keyFromText(value) {
  if (!value) return null;
  return createHash("sha256").update(String(value)).digest();
}

async function macKeychainKey(rootDir, run = execFile) {
  const account = projectAccount(rootDir);
  try {
    const { stdout } = await run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"]);
    const stored = Buffer.from(String(stdout).trim(), "base64url");
    if (stored.length === 32) return stored;
  } catch (error) {
    if (![44, 45].includes(error.code) && !String(error.stderr || "").includes("could not be found")) throw error;
  }
  const key = randomBytes(32);
  await run("security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", key.toString("base64url")]);
  return key;
}

export async function resolveVaultKey(rootDir, options = {}) {
  if (Buffer.isBuffer(options.key) && options.key.length === 32) return options.key;
  const environmentKey = keyFromText((options.environment ?? process.env).AGENTMON_VAULT_KEY);
  if (environmentKey) return environmentKey;
  if ((options.platform ?? process.platform) === "darwin") return macKeychainKey(rootDir, options.execFile ?? execFile);
  throw new Error("Encrypted vault requires AGENTMON_VAULT_KEY on this platform. Plaintext fallback is disabled.");
}

function encryptJson(value, key, aad) {
  const nonce = randomBytes(12);
  const plaintext = Buffer.from(`${JSON.stringify(value)}\n`);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    format: VAULT_FORMAT,
    cipher: "AES-256-GCM",
    nonce: nonce.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptJson(envelope, key, aad) {
  if (envelope?.format !== VAULT_FORMAT || envelope.cipher !== "AES-256-GCM") throw new Error("Unsupported Agentmon vault envelope.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonce, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8"));
}

function safePath(rootDir, name) {
  if (!/^[a-z0-9][a-z0-9/_-]{0,159}$/i.test(name) || name.includes("..")) throw new Error("Invalid vault record name.");
  const vaultRoot = resolve(rootDir, ".agentmon/vault");
  const path = resolve(vaultRoot, `${name}.enc.json`);
  if (!path.startsWith(`${vaultRoot}${sep}`)) throw new Error("Vault record escaped its root.");
  return path;
}

export function createLocalVault(rootDir, options = {}) {
  const projectRoot = resolve(rootDir);
  let keyPromise;
  const getKey = () => (keyPromise ??= resolveVaultKey(projectRoot, options));
  return {
    async readJson(name, fallback = null) {
      const path = safePath(projectRoot, name);
      try {
        const envelope = JSON.parse(await readFile(path, "utf8"));
        return decryptJson(envelope, await getKey(), `${projectAccount(projectRoot)}:${name}`);
      } catch (error) {
        if (error.code === "ENOENT") return fallback;
        throw error;
      }
    },
    async writeJson(name, value) {
      const path = safePath(projectRoot, name);
      const envelope = encryptJson(value, await getKey(), `${projectAccount(projectRoot)}:${name}`);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
      await rename(temporary, path);
      return path;
    },
  };
}
