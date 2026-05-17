import type { AgentProfile } from "../types.ts";

export const copilotProfile: AgentProfile = {
  name: "copilot",
  cliPath: "copilot",
  defaultFlags: [],
  skillFolder: "~/.copilot/skills",
  authEnvVars: ["GITHUB_TOKEN"],
  sandcastleProvider: "noSandbox",
  maxIterations: 10,
  defaultTimeout: 600_000,
};
