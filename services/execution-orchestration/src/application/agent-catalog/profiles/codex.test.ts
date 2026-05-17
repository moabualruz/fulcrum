import { describe, expect, test } from "bun:test";
import { getProfile, listProfiles } from "../registry.ts";
import { AgentProfileSchema } from "../types.ts";
import { codexProfile } from "./codex.ts";

describe("codex profile", () => {
  test("exports the sandbox-runner adapter defaults for Codex CLI", () => {
    expect(AgentProfileSchema.parse(codexProfile)).toEqual({
      name: "codex",
      cliPath: "codex",
      defaultFlags: [],
      skillFolder: "~/.codex/skills",
      authEnvVars: ["OPENAI_API_KEY"],
      sandcastleProvider: "noSandbox",
      maxIterations: 10,
      defaultTimeout: 600_000,
    });
  });

  test("registry loads codex from the profile module", () => {
    expect(getProfile("codex")).toEqual(codexProfile);
    expect(listProfiles().map((profile) => profile.name)).toContain("codex");
  });
});
