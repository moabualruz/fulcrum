import { describe, expect, it } from "vitest";
import {
  createCopilotAgentProfile,
  createCopilotInvocation,
  rejectUnsupportedCopilotCommand
} from "@fulcrum/agents";
import { buildCopilotDoctorReport } from "@fulcrum/core";

describe("Copilot agent profile", () => {
  it("uses standalone copilot with prompt mode, plugins, skills, persistence, MCP, and fleet capabilities", () => {
    const profile = createCopilotAgentProfile();
    const invocation = createCopilotInvocation({
      prompt: "implement task",
      sessionId: "sess_1",
      plugins: ["github"],
      skills: ["review"],
      mcpConfigPath: ".fulcrum/mcp.json",
      subagents: 3
    });

    expect(profile.command).toBe("copilot");
    expect(profile.rejectedCommands).toEqual(["gh copilot"]);
    expect(profile.supportsPlugins).toBe(true);
    expect(profile.supportsSkills).toBe(true);
    expect(profile.supportsMcp).toBe(true);
    expect(profile.supportsSessionPersistence).toBe(true);
    expect(profile.supportsSubagents).toBe(true);
    expect(profile.supportsFleet).toBe(true);
    expect(invocation.command).toBe("copilot");
    expect(invocation.args).toContain("--mcp-config");
    expect(invocation.capabilityModel.fleet).toBe(true);
    expect(() => rejectUnsupportedCopilotCommand("gh copilot suggest")).toThrow(/standalone/);
  });

  it("reports doctor checks for version, auth, policy, MCP, and gh copilot rejection", () => {
    const report = buildCopilotDoctorReport({
      hasStandaloneCommand: true,
      hasGhCopilot: true,
      authenticated: false,
      policyAllowsRemoteProvider: false,
      mcpConfigured: true,
      version: "1.2.3"
    });

    expect(report.command).toBe("copilot");
    expect(report.rejectedCommand).toBe("gh copilot");
    expect(report.version).toBe("1.2.3");
    expect(report.capabilities.mcp).toBe(true);
    expect(report.health.state).toBe("guided");
    expect(report.checks.map((check) => check.name)).toEqual([
      "standalone-command",
      "gh-copilot-rejected",
      "auth",
      "policy",
      "mcp"
    ]);
  });
});
