import assert from "node:assert/strict";
import test from "node:test";
import { createFeed, extractUserPrompts, sanitizePrompt } from "../scripts/collector.mjs";

test("keeps only user text and strips injected context", () => {
  const thread = {
    id: "thread-1",
    cwd: "/workspace",
    updatedAt: 1,
    turns: [{
      id: "turn-1",
      startedAt: 1,
      items: [
        { type: "userMessage", id: "user-1", content: [{ type: "text", text: "Build the battle screen.\n<environment_context>private metadata</environment_context>" }] },
        { type: "agentMessage", id: "agent-1", text: "I will inspect files." },
        { type: "commandExecution", id: "tool-1", aggregatedOutput: "SECRET" },
      ],
    }],
  };
  assert.deepEqual(extractUserPrompts(thread).map((prompt) => prompt.text), ["Build the battle screen."]);
});

test("redacts common credentials", () => {
  const result = sanitizePrompt("Authorization: Bearer super-secret-token and api_key=1234567890abcdef");
  assert.equal(result.redactions, 2);
  assert.doesNotMatch(result.text, /super-secret-token|1234567890abcdef/);
});

test("creates a stable local feed revision", () => {
  const thread = { id: "thread-1", name: "Demo", cwd: "/workspace", updatedAt: 2, turns: [] };
  const first = createFeed(thread);
  const second = createFeed(thread);
  assert.equal(first.format, "agentmon.feed/v1");
  assert.equal(first.consent.scope, "user_prompts_only");
  assert.equal(first.revision, second.revision);
});
