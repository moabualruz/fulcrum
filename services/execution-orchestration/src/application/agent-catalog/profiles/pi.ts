import type { AgentProfile } from "../types.ts";

export const piProfile: AgentProfile = {
  name: "pi",
  cliPath: "pi",
  defaultFlags: [],
  skillFolder: "~/.pi/agent/skills",
  authEnvVars: ["ANTHROPIC_API_KEY"],
  sandcastleProvider: "noSandbox",
  maxIterations: 10,
  defaultTimeout: 600_000,
};
