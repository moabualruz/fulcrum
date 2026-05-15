import { describe, expect, test } from "bun:test";
import { getProfile, listProfiles } from "../registry.ts";
import { AgentProfileSchema } from "../types.ts";
import { claudeCodeProfile } from "./claude-code.ts";

describe("claude-code profile", () => {
  test("exports the sandbox-runner adapter defaults for Claude Code", () => {
    expect(AgentProfileSchema.parse(claudeCodeProfile)).toEqual({
      name: "claude-code",
      cliPath: "claude",
      defaultFlags: ["--dangerously-skip-permissions"],
      skillFolder: "~/.claude/skills",
      authEnvVars: ["ANTHROPIC_API_KEY"],
      sandcastleProvider: "noSandbox",
      maxIterations: 10,
      defaultTimeout: 600_000,
      tokenCountPattern: "Tokens used:\\s*(\\d+)\\s*input,\\s*(\\d+)\\s*output",
      supportsSessionResume: true,
    });
  });

  test("registry loads claude-code from the profile module", () => {
    expect(getProfile("claude-code")).toEqual(claudeCodeProfile);
    expect(listProfiles().map((profile) => profile.name)).toContain("claude-code");
  });
});
