#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const FORMAT = "agentmon.feed/v1";
const DEFAULT_INTERVAL = 2500;

export function sanitizePrompt(input) {
  let text = String(input ?? "")
    .replace(/<(environment_context|recommended_plugins)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<permissions instructions>[\s\S]*?<\/permissions instructions>/gi, "")
    .trim();
  let redactions = 0;

  const replacements = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
    [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED API KEY]"],
    [/\b(?:ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED TOKEN]"],
    [/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]"],
    [/((?:api[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*)["']?[^\s,"']{8,}["']?/gi, "$1[REDACTED]"],
    [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi, (match) => `${match.slice(0, match.indexOf("://") + 3)}[REDACTED]@`],
  ];

  for (const [pattern, replacement] of replacements) {
    redactions += text.match(pattern)?.length ?? 0;
    text = text.replace(pattern, replacement);
  }

  return { text: text.trim(), redactions };
}

export function extractUserPrompts(thread) {
  const prompts = [];
  for (const turn of thread?.turns ?? []) {
    for (const item of turn?.items ?? []) {
      if (item?.type !== "userMessage") continue;
      const raw = (item.content ?? [])
        .filter((content) => content?.type === "text")
        .map((content) => content.text)
        .join("\n\n");
      const { text, redactions } = sanitizePrompt(raw);
      if (!text) continue;
      prompts.push({
        id: item.id,
        turnId: turn.id,
        capturedAt: turn.startedAt ? new Date(turn.startedAt * 1000).toISOString() : null,
        text,
        chars: text.length,
        redactions,
      });
    }
  }
  return prompts;
}

export function createFeed(thread) {
  const prompts = extractUserPrompts(thread);
  const revision = createHash("sha256")
    .update(JSON.stringify(prompts.map(({ id, turnId, text }) => ({ id, turnId, text }))))
    .digest("hex")
    .slice(0, 16);
  return {
    format: FORMAT,
    source: "codex",
    revision,
    generatedAt: new Date().toISOString(),
    consent: {
      scope: "user_prompts_only",
      includes: ["User-authored text prompts from one approved Codex task"],
      excludes: ["System and developer instructions", "Assistant messages", "Tool output", "File contents", "Credentials and detected secrets"],
    },
    thread: {
      id: thread.id,
      label: thread.name || "Codex task",
      cwd: String(thread.cwd ?? ""),
      updatedAt: Number(thread.updatedAt ?? 0),
    },
    prompts,
    totals: {
      prompts: prompts.length,
      characters: prompts.reduce((sum, prompt) => sum + prompt.chars, 0),
      redactions: prompts.reduce((sum, prompt) => sum + prompt.redactions, 0),
    },
  };
}

class AppServerClient {
  constructor(command, cwd) {
    this.command = command;
    this.cwd = cwd;
    this.nextId = 1;
    this.pending = new Map();
    this.process = null;
  }

  async start() {
    this.process = spawn(this.command, ["app-server", "--listen", "stdio://"], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.process.once("error", (error) => this.rejectAll(error));
    this.process.once("exit", (code) => this.rejectAll(new Error(`Codex app-server exited with code ${code}`)));
    const lines = readline.createInterface({ input: this.process.stdout });
    lines.on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "Codex app-server request failed"));
      else pending.resolve(message.result);
    });

    await this.request("initialize", {
      clientInfo: { name: "agentmon_codex", title: "Agentmon Codex Collector", version: "0.1.0" },
    });
    this.notify("initialized", {});
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 20000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolvePromise(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.send({ method, id, params });
    });
  }

  notify(method, params) { this.send({ method, params }); }
  send(message) { this.process.stdin.write(`${JSON.stringify(message)}\n`); }
  rejectAll(error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
  stop() { if (this.process && !this.process.killed) this.process.kill("SIGTERM"); }
}

function parseArgs(argv) {
  const args = { cwd: process.cwd(), out: ".agentmon/codex-feed.json", threadId: null, watch: false, interval: DEFAULT_INTERVAL, list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--watch") args.watch = true;
    else if (value === "--list") args.list = true;
    else if (value === "--cwd") args.cwd = resolve(argv[++index]);
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--thread") args.threadId = argv[++index];
    else if (value === "--interval") args.interval = Math.max(1000, Number(argv[++index]) || DEFAULT_INTERVAL);
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  args.out = resolve(args.cwd, args.out);
  return args;
}

function help() {
  return `Agentmon Codex collector\n\nUsage:\n  node collector.mjs [--watch] [--thread THREAD_ID] [--cwd PATH] [--out PATH]\n  node collector.mjs --list [--cwd PATH]\n\nThe collector reads one approved Codex task and writes only sanitized user prompts.\nAssistant messages, tool output, system instructions, files, and detected secrets are excluded.`;
}

async function chooseThread(client, args) {
  if (args.threadId) return args.threadId;
  const result = await client.request("thread/list", {
    cwd: args.cwd,
    limit: 25,
    sortKey: "updated_at",
    sortDirection: "desc",
    archived: false,
  });
  if (args.list) {
    for (const thread of result.data ?? []) {
      process.stdout.write(`${thread.id}\t${thread.name || "Untitled task"}\t${new Date(thread.updatedAt * 1000).toISOString()}\n`);
    }
    return null;
  }
  const thread = (result.data ?? []).find((candidate) => !candidate.ephemeral && !candidate.parentThreadId);
  if (!thread) throw new Error(`No Codex task found for ${args.cwd}. Pass --thread with an explicit task id.`);
  return thread.id;
}

async function writeFeed(path, feed) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const payload = `${JSON.stringify(feed, null, 2)}\n`;
  await writeFile(temporary, payload, { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch {
    await writeFile(path, payload, { mode: 0o600 });
    await unlink(temporary).catch(() => undefined);
  }
}

async function collect(client, threadId, output, previousRevision) {
  const result = await client.request("thread/read", { threadId, includeTurns: true });
  const feed = createFeed(result.thread);
  if (feed.revision !== previousRevision) {
    await writeFeed(output, feed);
    process.stdout.write(`Agentmon feed updated: ${feed.totals.prompts} prompts, ${feed.totals.redactions} redactions → ${output}\n`);
  }
  return feed.revision;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(`${help()}\n`); return; }
  const client = new AppServerClient(process.env.AGENTMON_CODEX_BIN || "codex", args.cwd);
  const stop = () => { client.stop(); process.exitCode = 0; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await client.start();
    const threadId = await chooseThread(client, args);
    if (!threadId) return;
    let revision = await collect(client, threadId, args.out, null);
    if (!args.watch) return;
    process.stdout.write(`Watching approved task ${threadId}. Press Ctrl+C to stop.\n`);
    while (!client.process.killed) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, args.interval));
      revision = await collect(client, threadId, args.out, revision);
    }
  } finally {
    client.stop();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Agentmon collector failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
