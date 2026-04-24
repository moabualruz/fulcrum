export interface CopilotAgentProfile {
  id: "copilot";
  command: "copilot";
  rejectedCommands: ["gh copilot"];
  promptMode: "stdin" | "argument";
  versionArgs: ["--version"];
  supportsPlugins: boolean;
  supportsSkills: boolean;
  supportsMcp: boolean;
  supportsSessionPersistence: boolean;
  supportsSubagents: boolean;
  supportsFleet: boolean;
  installHints: string[];
}

export interface CopilotRunInput {
  prompt: string;
  sessionId?: string;
  plugins?: string[];
  skills?: string[];
  mcpConfigPath?: string;
  subagents?: number;
}

export interface CopilotInvocation {
  command: "copilot";
  args: string[];
  stdin: string;
  sessionId?: string;
  capabilityModel: {
    plugins: string[];
    skills: string[];
    mcpConfigPath?: string;
    subagents: number;
    fleet: boolean;
  };
}

export function createCopilotAgentProfile(): CopilotAgentProfile {
  return {
    id: "copilot",
    command: "copilot",
    rejectedCommands: ["gh copilot"],
    promptMode: "stdin",
    versionArgs: ["--version"],
    supportsPlugins: true,
    supportsSkills: true,
    supportsMcp: true,
    supportsSessionPersistence: true,
    supportsSubagents: true,
    supportsFleet: true,
    installHints: [
      "Install the standalone GitHub Copilot CLI that provides a copilot executable.",
      "Authenticate the standalone copilot CLI before enabling Fulcrum runs.",
      "Do not configure gh copilot; Fulcrum rejects the GitHub CLI extension path."
    ]
  };
}

export function createCopilotInvocation(input: CopilotRunInput): CopilotInvocation {
  return {
    command: "copilot",
    args: [
      "prompt",
      ...(input.sessionId ? ["--session", input.sessionId] : []),
      ...(input.mcpConfigPath ? ["--mcp-config", input.mcpConfigPath] : []),
      ...(input.plugins ?? []).flatMap((plugin) => ["--plugin", plugin]),
      ...(input.skills ?? []).flatMap((skill) => ["--skill", skill]),
      ...(input.subagents ? ["--subagents", String(input.subagents)] : [])
    ],
    stdin: input.prompt,
    sessionId: input.sessionId,
    capabilityModel: {
      plugins: input.plugins ?? [],
      skills: input.skills ?? [],
      mcpConfigPath: input.mcpConfigPath,
      subagents: input.subagents ?? 0,
      fleet: (input.subagents ?? 0) > 1
    }
  };
}

export function rejectUnsupportedCopilotCommand(command: string): void {
  if (command.trim().startsWith("gh copilot")) {
    throw new Error("Fulcrum requires standalone copilot CLI; gh copilot is not accepted.");
  }
}
