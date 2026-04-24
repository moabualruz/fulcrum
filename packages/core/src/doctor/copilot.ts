import { makeId, type CapabilityHealthRecord } from "@fulcrum/shared";

export interface CopilotDoctorInput {
  hasStandaloneCommand: boolean;
  hasGhCopilot?: boolean;
  authenticated: boolean;
  policyAllowsRemoteProvider: boolean;
  mcpConfigured: boolean;
  version?: string;
}

export interface CopilotDoctorReport {
  profileId: "copilot";
  command: "copilot";
  rejectedCommand: "gh copilot";
  version?: string;
  capabilities: {
    promptMode: boolean;
    plugins: boolean;
    skills: boolean;
    sessionPersistence: boolean;
    subagents: boolean;
    fleet: boolean;
    mcp: boolean;
  };
  health: CapabilityHealthRecord;
  checks: Array<{ name: string; state: "pass" | "fail"; message: string }>;
}

export function buildCopilotDoctorReport(input: CopilotDoctorInput): CopilotDoctorReport {
  const checks = [
    {
      name: "standalone-command",
      state: input.hasStandaloneCommand ? ("pass" as const) : ("fail" as const),
      message: input.hasStandaloneCommand
        ? "copilot command found."
        : "Install standalone copilot CLI."
    },
    {
      name: "gh-copilot-rejected",
      state: input.hasGhCopilot ? ("fail" as const) : ("pass" as const),
      message: input.hasGhCopilot
        ? "gh copilot is present but rejected."
        : "No unsupported gh copilot path selected."
    },
    {
      name: "auth",
      state: input.authenticated ? ("pass" as const) : ("fail" as const),
      message: input.authenticated ? "copilot auth available." : "Authenticate copilot CLI."
    },
    {
      name: "policy",
      state: input.policyAllowsRemoteProvider ? ("pass" as const) : ("fail" as const),
      message: input.policyAllowsRemoteProvider
        ? "Remote provider policy configured."
        : "Remote provider policy approval required."
    },
    {
      name: "mcp",
      state: input.mcpConfigured ? ("pass" as const) : ("fail" as const),
      message: input.mcpConfigured ? "MCP config available." : "Configure MCP path for copilot."
    }
  ];
  const failed = checks.filter((check) => check.state === "fail");
  return {
    profileId: "copilot",
    command: "copilot",
    rejectedCommand: "gh copilot",
    version: input.version,
    capabilities: {
      promptMode: true,
      plugins: true,
      skills: true,
      sessionPersistence: true,
      subagents: true,
      fleet: true,
      mcp: input.mcpConfigured
    },
    health: {
      capabilityId: makeId("cap", "copilot-cli"),
      state: failed.length === 0 ? "managed" : "guided",
      blocking: false,
      cause: failed.map((check) => check.message).join(" "),
      nextAction: failed[0]?.message ?? "No action needed.",
      privacyStatus: "local_first",
      affectedWorkflows: ["run", "doctor", "mcp"],
      freshness: new Date().toISOString()
    },
    checks
  };
}
