import { describe, expect, it } from "vitest";
import { createCopilotAgentProfile, listAgentProfiles, rejectUnsupportedCopilotCommand } from "@fulcrum/agents";

describe("Copilot standalone CLI acceptance", () => {
  it("accepts only standalone copilot profile and rejects gh copilot extension path", () => {
    const profile = createCopilotAgentProfile();

    expect(profile.command).toBe("copilot");
    expect(profile.versionArgs).toEqual(["--version"]);
    expect(profile.rejectedCommands).toEqual(["gh copilot"]);
    expect(listAgentProfiles().find((item) => item.agentId === "agent_copilot")?.command).toBe("copilot");
    expect(() => rejectUnsupportedCopilotCommand("gh copilot explain")).toThrow(/standalone copilot CLI/);
    expect(() => rejectUnsupportedCopilotCommand("copilot prompt")).not.toThrow();
  });
});
