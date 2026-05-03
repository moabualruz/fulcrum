import type { AgentProfile } from "../types.ts";

export const claudeCodeProfile: AgentProfile = {
  name: "claude-code",
  cliPath: "claude",
  defaultFlags: ["--dangerously-skip-permissions"],
  skillFolder: "~/.claude/skills",
  authEnvVars: ["ANTHROPIC_API_KEY"],
  sandcastleProvider: "noSandbox",
  maxIterations: 10,
  defaultTimeout: 600_000,
};
