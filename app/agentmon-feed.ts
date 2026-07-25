export type AgentmonFeedPrompt = {
  id: string;
  turnId: string;
  capturedAt: string | null;
  text: string;
  chars: number;
  redactions: number;
};

export type AgentmonFeed = {
  format: "agentmon.feed/v1";
  source: "codex";
  revision: string;
  generatedAt: string;
  consent: {
    scope: "user_prompts_only";
    includes: string[];
    excludes: string[];
  };
  thread: {
    id: string;
    label: string;
    cwd: string;
    updatedAt: number;
  };
  prompts: AgentmonFeedPrompt[];
  totals: {
    prompts: number;
    characters: number;
    redactions: number;
  };
};

export function parseAgentmonFeed(value: string): AgentmonFeed {
  const candidate = JSON.parse(value) as Partial<AgentmonFeed>;
  if (
    candidate.format !== "agentmon.feed/v1" ||
    candidate.source !== "codex" ||
    candidate.consent?.scope !== "user_prompts_only" ||
    typeof candidate.revision !== "string" ||
    !candidate.thread?.id ||
    !Array.isArray(candidate.prompts)
  ) {
    throw new Error("Invalid Agentmon Codex feed");
  }

  const prompts = candidate.prompts.filter(
    (prompt): prompt is AgentmonFeedPrompt =>
      typeof prompt?.id === "string" &&
      typeof prompt?.turnId === "string" &&
      typeof prompt?.text === "string" &&
      prompt.text.trim().length > 0,
  );

  return { ...candidate, prompts } as AgentmonFeed;
}
