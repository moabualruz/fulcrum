import type { AgentProfile } from "../types.ts";

export const codexProfile: AgentProfile = {
  name: "codex",
  cliPath: "codex",
  defaultFlags: [],
  skillFolder: "~/.codex/skills",
  authEnvVars: ["OPENAI_API_KEY"],
  sandcastleProvider: "noSandbox",
  maxIterations: 10,
  defaultTimeout: 600_000,
};
