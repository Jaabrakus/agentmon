import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const BLOCKED_SEGMENTS = new Set([".agentmon", ".git", ".next", "node_modules", "dist", "coverage"]);
const BLOCKED_NAMES = [/^\.env(?:\.|$)/i, /\.pem$/i, /\.key$/i, /^credentials?\./i, /^secrets?\./i];

function allowed(relativePath, extraExcludes = []) {
  const segments = relativePath.split(sep).filter(Boolean);
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment))) return false;
  if (BLOCKED_NAMES.some((pattern) => pattern.test(segments.at(-1) ?? ""))) return false;
  return !extraExcludes.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}${sep}`));
}

async function treeDigest(directory) {
  const hash = createHash("sha256");
  async function walk(path) {
    const names = (await readdir(path)).sort();
    for (const name of names) {
      const child = join(path, name);
      const info = await lstat(child);
      const key = relative(directory, child);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await walk(child);
      else if (info.isFile()) {
        hash.update(key); hash.update("\0"); hash.update(await readFile(child)); hash.update("\0");
      }
    }
  }
  await walk(directory);
  return hash.digest("hex");
}

export async function createIsolatedWorkspace(rootDir, options = {}) {
  const source = await realpath(resolve(rootDir));
  if (source === sep) throw new Error("Refusing to snapshot a filesystem root.");
  const parent = await mkdtemp(join(tmpdir(), "agentmon-proof-"));
  const workspace = join(parent, basename(source));
  const excludes = (options.excludes ?? []).map(String);
  try {
    await cp(source, workspace, {
      recursive: true,
      preserveTimestamps: true,
      filter: async (sourcePath) => {
        const relativePath = relative(source, sourcePath);
        if (!relativePath) return true;
        if (!allowed(relativePath, excludes)) return false;
        return !(await lstat(sourcePath)).isSymbolicLink();
      },
    });
    const digest = await treeDigest(workspace);
    return {
      format: "agentmon.isolated-workspace/v1",
      workspace,
      digest,
      isolation: "private-filesystem-snapshot",
      networkIsolated: false,
      cleanup: () => rm(parent, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

export async function runIsolatedProof(options) {
  if (!options?.command) throw new Error("An explicit proof command is required.");
  const snapshot = await createIsolatedWorkspace(options.rootDir, options);
  const timeoutMs = Math.max(100, Math.min(30 * 60_000, Number(options.timeoutMs) || 120_000));
  try {
    const result = await new Promise((resolvePromise, reject) => {
      const child = spawn(options.command, options.args ?? [], {
        cwd: snapshot.workspace,
        shell: false,
        env: { PATH: process.env.PATH ?? "", HOME: snapshot.workspace, TMPDIR: tmpdir(), ...(options.env ?? {}) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout = []; const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(chunk)); child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.once("error", reject);
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolvePromise({ code, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
      });
    });
    return { format: "agentmon.isolated-proof-run/v1", workspaceDigest: snapshot.digest, isolation: snapshot.isolation, networkIsolated: false, ...result };
  } finally {
    if (options.keepWorkspace !== true) await snapshot.cleanup();
  }
}
