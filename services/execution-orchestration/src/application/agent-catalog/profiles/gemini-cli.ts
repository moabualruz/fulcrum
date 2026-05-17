import type { AgentProfile } from "../types.ts";

export const geminiCliProfile: AgentProfile = {
  name: "gemini-cli",
  cliPath: "gemini",
  defaultFlags: [],
  skillFolder: "~/.gemini/extensions/fulcrum-skills/skills",
  authEnvVars: ["GEMINI_API_KEY"],
  sandcastleProvider: "noSandbox",
  maxIterations: 10,
  defaultTimeout: 600_000,
};
