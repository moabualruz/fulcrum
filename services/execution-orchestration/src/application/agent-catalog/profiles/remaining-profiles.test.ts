import { describe, expect, test } from "bun:test";
import { getProfile, listProfiles } from "../registry.ts";
import { AgentProfileSchema } from "../types.ts";
import { copilotProfile } from "./copilot.ts";
import { geminiCliProfile } from "./gemini-cli.ts";
import { opencodeProfile } from "./opencode.ts";
import { piProfile } from "./pi.ts";

describe("remaining agent profiles", () => {
  test("exports the sandbox-runner adapter defaults for Pi CLI", () => {
    expect(AgentProfileSchema.parse(piProfile)).toEqual({
      name: "pi",
      cliPath: "pi",
      defaultFlags: [],
      skillFolder: "~/.pi/agent/skills",
      authEnvVars: ["ANTHROPIC_API_KEY"],
      sandcastleProvider: "noSandbox",
      maxIterations: 10,
      defaultTimeout: 600_000,
    });
  });

  test("exports the sandbox-runner adapter defaults for GitHub Copilot CLI", () => {
    expect(AgentProfileSchema.parse(copilotProfile)).toEqual({
      name: "copilot",
      cliPath: "copilot",
      defaultFlags: [],
      skillFolder: "~/.copilot/skills",
      authEnvVars: ["GITHUB_TOKEN"],
      sandcastleProvider: "noSandbox",
      maxIterations: 10,
      defaultTimeout: 600_000,
    });
  });

  test("exports the sandbox-runner adapter defaults for OpenCode", () => {
    expect(AgentProfileSchema.parse(opencodeProfile)).toEqual({
      name: "opencode",
      cliPath: "opencode",
      defaultFlags: [],
      skillFolder: "~/.config/opencode/skills",
      authEnvVars: ["ANTHROPIC_API_KEY"],
      sandcastleProvider: "noSandbox",
      maxIterations: 10,
      defaultTimeout: 600_000,
    });
  });

  test("exports the sandbox-runner adapter defaults for Gemini CLI", () => {
    expect(AgentProfileSchema.parse(geminiCliProfile)).toEqual({
      name: "gemini-cli",
      cliPath: "gemini",
      defaultFlags: [],
      skillFolder: "~/.gemini/extensions/fulcrum-skills/skills",
      authEnvVars: ["GEMINI_API_KEY"],
      sandcastleProvider: "noSandbox",
      maxIterations: 10,
      defaultTimeout: 600_000,
    });
  });

  test("registry loads all six profile modules", () => {
    expect(getProfile("pi")).toEqual(piProfile);
    expect(getProfile("copilot")).toEqual(copilotProfile);
    expect(getProfile("opencode")).toEqual(opencodeProfile);
    expect(getProfile("gemini-cli")).toEqual(geminiCliProfile);

    expect(listProfiles().map((profile) => profile.name)).toEqual([
      "claude-code",
      "codex",
      "copilot",
      "gemini-cli",
      "opencode",
      "pi",
    ]);
  });
});
