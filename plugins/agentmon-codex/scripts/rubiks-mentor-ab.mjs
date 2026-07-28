#!/usr/bin/env node
import { createCodexCliArenaProvider } from "../lib/arena-harness.mjs";
import { createAutomaticDownlink } from "../desktop-app/desktop-downlink-service.mjs";

const rootDir = process.cwd();
const model = process.argv[2] || "gpt-5.6-sol";
const task = "I have a scrambled 3×3 Rubik’s Cube and I am a visual beginner. Teach me only the first stage: making a correct white cross. Do not assume I know cube notation. Give me: (1) what pieces to look for, (2) one action at a time, (3) how to verify each white edge also matches its side-center color, and (4) what to do when a white edge is upside down. Keep the answer under 220 words. Do not claim you can see my cube.";
const rubric = {
  correctness: "Explains a correct beginner-safe method for building a white cross, including matching side-center colors and handling an upside-down white edge.",
  clarity: "Uses visual, notation-free, one-action-at-a-time language suitable for a complete beginner.",
  adherence: "Covers all four requested items, stays under 220 words, and does not claim visual access to the cube.",
  usefulness: "Includes checks that let the user notice and recover from a wrong cross rather than merely describing the final state.",
};

const downlink = await createAutomaticDownlink(rootDir, rootDir, "main", task);
if (!downlink?.packet) throw new Error("Guardot could not compile an identity downlink for the Rubik's Cube task.");
const provider = createCodexCliArenaProvider({ model, reasoningEffort: "medium", cwd: rootDir });
const [generic, agentmon] = await Promise.all([
  provider.generate({ task, systemPrompt: "You are a helpful assistant. Follow the user's constraints and answer directly." }),
  provider.generate({ task, systemPrompt: `${downlink.packet}\n\nSpeak as the active Agentmon companion, but do not role-play capabilities you do not have. Apply only relevant proven procedures; otherwise use the identity lens and answer directly.` }),
]);
const judged = await provider.compare({ task, rubric, candidates: { A: generic, B: agentmon } });

process.stdout.write(`${JSON.stringify({
  format: "agentmon.rubiks-ab/v1",
  model,
  agentmon: downlink.agentmon,
  matchedProcedures: downlink.procedures.map((procedure) => ({ id: procedure.id, name: procedure.name })),
  taskDigest: downlink.queryDigest,
  generic: { answer: generic, blindScore: judged.scores.A },
  agentmonAnswer: { answer: agentmon, blindScore: judged.scores.B },
  privacy: { persistedByScript: false, trainedFromTest: false, rawPromptStoredByAgentmon: false, rawResponsesStoredByAgentmon: false },
}, null, 2)}\n`);
