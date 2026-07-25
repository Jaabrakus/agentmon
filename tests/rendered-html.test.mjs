import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Codex-connected Agentmon hatchery", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Agentmon — Connect Codex\. Hatch Your Working Style\.<\/title>/i);
  assert.match(html, /YOUR PROMPTS/);
  assert.match(html, /CODEX ADAPTER/);
  assert.match(html, /CONNECT CODEX/);
  assert.doesNotMatch(html, /codex-preview|Building your site/);
});

test("ships the collector, privacy parser, and downloadable adapter", async () => {
  const [page, parser, collector, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/agentmon-feed.ts", import.meta.url), "utf8"),
    readFile(new URL("../plugins/agentmon-codex/scripts/collector.mjs", import.meta.url), "utf8"),
    readFile(new URL("../plugins/agentmon-codex/.codex-plugin/plugin.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /showOpenFilePicker/);
  assert.match(page, /LOCAL PRIVACY RECEIPT/);
  assert.match(parser, /agentmon\.feed\/v1/);
  assert.match(collector, /thread\/read/);
  assert.match(collector, /userMessage/);
  assert.match(manifest, /agentmon-trainer|Agentmon Codex/i);
  await access(new URL("../public/agentmon-codex-plugin.zip", import.meta.url));
});
