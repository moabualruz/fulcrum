import type { AgentProfile } from "../types.ts";

export const opencodeProfile: AgentProfile = {
  name: "opencode",
  cliPath: "opencode",
  defaultFlags: [],
  skillFolder: "~/.config/opencode/skills",
  authEnvVars: ["ANTHROPIC_API_KEY"],
  sandcastleProvider: "noSandbox",
  maxIterations: 10,
  defaultTimeout: 600_000,
};
