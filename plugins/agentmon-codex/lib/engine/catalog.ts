import type { Move, PromptprintKey, RoleKey, SkillKey, TraitKey } from "./types";

export const traitMeta: Record<TraitKey, { label: string; icon: string; color: string; type: string }> = {
  reasoning: { label: "Reasoning", icon: "◆", color: "#6b5cff", type: "LOGIC" },
  curiosity: { label: "Curiosity", icon: "?", color: "#ffb52e", type: "SPARK" },
  reliability: { label: "Reliability", icon: "▣", color: "#2fbf71", type: "GUARD" },
  initiative: { label: "Initiative", icon: "↟", color: "#ff625f", type: "BOLT" },
  empathy: { label: "Empathy", icon: "♥", color: "#ff70aa", type: "HEART" },
  toolcraft: { label: "Toolcraft", icon: "⌘", color: "#27a9e8", type: "GEAR" },
};

export const promptprintMeta: Record<PromptprintKey, { label: string; icon: string; color: string; copy: string }> = {
  structure: { label: "Structure", icon: "▦", color: "#6755f5", copy: "Plans and formats before acting" },
  precision: { label: "Precision", icon: "⌖", color: "#2f78c4", copy: "Defines exact constraints and outputs" },
  exploration: { label: "Exploration", icon: "?", color: "#ffb52e", copy: "Opens alternatives and new paths" },
  iteration: { label: "Iteration", icon: "↻", color: "#ff625f", copy: "Refines repeatedly through feedback" },
  verification: { label: "Verification", icon: "✓", color: "#2fbf71", copy: "Checks claims, tests, and evidence" },
  delegation: { label: "Delegation", icon: "⋈", color: "#9b69e8", copy: "Splits work across agents or roles" },
  toolfulness: { label: "Toolfulness", icon: "⌘", color: "#27a9e8", copy: "Reaches for tools and integrations" },
  empathy: { label: "Human sense", icon: "♥", color: "#ff70aa", copy: "Shapes work around the audience" },
};

export const skillLibrary: Record<SkillKey, Move> = {
  reasoning: { id: "reasoning", name: "Logic Lock", type: "LOGIC", power: 66, description: "Breaks complex goals into precise steps.", icon: "◆" },
  web: { id: "web", name: "Web Scout", type: "SPARK", power: 54, description: "Searches live sources and brings back evidence.", icon: "⌕" },
  code: { id: "code", name: "Code Burst", type: "GEAR", power: 72, description: "Builds, debugs, and patches software.", icon: "</>" },
  memory: { id: "memory", name: "Recall Ward", type: "GUARD", power: 48, description: "Uses stored context and preferences safely.", icon: "▤" },
  tools: { id: "tools", name: "Tool Combo", type: "GEAR", power: 68, description: "Chains APIs, connectors, and MCP tools.", icon: "⌘" },
  vision: { id: "vision", name: "Pixel Sight", type: "SPARK", power: 58, description: "Reads images, screens, and visual artifacts.", icon: "◉" },
  planning: { id: "planning", name: "Quest Map", type: "LOGIC", power: 56, description: "Creates milestones and tracks the next action.", icon: "⌖" },
  loops: { id: "loops", name: "Loop Drive", type: "BOLT", power: 74, description: "Repeats a workflow until its exit condition is met.", icon: "↻" },
  delegation: { id: "delegation", name: "Swarm Call", type: "HEART", power: 64, description: "Splits work across helpers and recombines results.", icon: "⋈" },
  critique: { id: "critique", name: "Truth Check", type: "GUARD", power: 62, description: "Tests, reviews, and corrects weak outputs.", icon: "✓" },
};

export const roleDefaults: Record<RoleKey, { label: string; caption: string; traits: Record<TraitKey, number>; skills: SkillKey[] }> = {
  builder: { label: "Builder", caption: "ships code + tools", traits: { reasoning: 72, curiosity: 48, reliability: 61, initiative: 64, empathy: 34, toolcraft: 84 }, skills: ["reasoning", "code", "tools"] },
  researcher: { label: "Researcher", caption: "searches + verifies", traits: { reasoning: 76, curiosity: 86, reliability: 68, initiative: 42, empathy: 39, toolcraft: 55 }, skills: ["reasoning", "web", "critique"] },
  operator: { label: "Operator", caption: "acts + orchestrates", traits: { reasoning: 61, curiosity: 45, reliability: 74, initiative: 86, empathy: 32, toolcraft: 79 }, skills: ["tools", "planning", "loops"] },
  companion: { label: "Companion", caption: "remembers + supports", traits: { reasoning: 49, curiosity: 58, reliability: 69, initiative: 40, empathy: 89, toolcraft: 35 }, skills: ["memory", "reasoning", "vision"] },
};
