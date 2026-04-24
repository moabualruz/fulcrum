import { createCopilotAgentProfile } from "./copilot.js";

export type AgentPromptMechanism = "stdin" | "argument" | "file";

export interface AgentProfile {
  agentId: string;
  command: string;
  versionArgs: string[];
  promptMechanisms: AgentPromptMechanism[];
  defaultPromptMechanism: AgentPromptMechanism;
  roles: string[];
  supportsMcp: boolean;
  supportsHooks: boolean;
  localOnlyBehavior: string;
  installHints: string[];
  rejectedCommands?: string[];
}

function buildAgentProfiles(): AgentProfile[] {
  const copilot = createCopilotAgentProfile();
  const genericCommand =
    process.env.FULCRUM_GENERIC_AGENT_COMMAND?.trim() || "__fulcrum_generic_agent_unconfigured__";

  return [
    {
      agentId: "agent_codex",
      command: "codex",
      versionArgs: ["--version"],
      promptMechanisms: ["stdin", "argument"],
      defaultPromptMechanism: "stdin",
      roles: ["implementation", "review", "validation"],
      supportsMcp: true,
      supportsHooks: true,
      localOnlyBehavior:
        "Use local workspace context; remote model access remains explicit operator/provider configuration.",
      installHints: ["Install OpenAI Codex CLI and authenticate it before release acceptance."]
    },
    {
      agentId: "agent_claude",
      command: "claude",
      versionArgs: ["--version"],
      promptMechanisms: ["argument", "stdin"],
      defaultPromptMechanism: "argument",
      roles: ["implementation", "review", "validation"],
      supportsMcp: true,
      supportsHooks: true,
      localOnlyBehavior:
        "Use local workspace context; remote model access remains explicit operator/provider configuration.",
      installHints: ["Install Claude Code CLI and authenticate it before release acceptance."]
    },
    {
      agentId: "agent_gemini",
      command: "gemini",
      versionArgs: ["--version"],
      promptMechanisms: ["argument", "stdin"],
      defaultPromptMechanism: "argument",
      roles: ["implementation", "validation"],
      supportsMcp: true,
      supportsHooks: false,
      localOnlyBehavior:
        "Use local workspace context; network/provider access must be operator configured.",
      installHints: ["Install Gemini CLI and authenticate it before release acceptance."]
    },
    {
      agentId: "agent_opencode",
      command: "opencode",
      versionArgs: ["--version"],
      promptMechanisms: ["argument", "stdin"],
      defaultPromptMechanism: "argument",
      roles: ["implementation", "validation"],
      supportsMcp: true,
      supportsHooks: false,
      localOnlyBehavior: "Use local workspace context; remote provider use must be operator configured.",
      installHints: ["Install OpenCode CLI and configure its provider before release acceptance."]
    },
    {
      agentId: "agent_copilot",
      command: copilot.command,
      versionArgs: copilot.versionArgs,
      promptMechanisms: [copilot.promptMode],
      defaultPromptMechanism: copilot.promptMode,
      roles: ["implementation", "review", "validation"],
      supportsMcp: copilot.supportsMcp,
      supportsHooks: copilot.supportsSessionPersistence,
      localOnlyBehavior:
        "Use local workspace context; remote Copilot provider access remains operator configured.",
      installHints: [...copilot.installHints],
      rejectedCommands: [...copilot.rejectedCommands]
    },
    {
      agentId: "agent_aider",
      command: "aider",
      versionArgs: ["--version"],
      promptMechanisms: ["argument"],
      defaultPromptMechanism: "argument",
      roles: ["implementation"],
      supportsMcp: false,
      supportsHooks: false,
      localOnlyBehavior:
        "Use repository files only; provider/network behavior follows explicit Aider configuration.",
      installHints: ["Install Aider and configure model credentials before release acceptance."]
    },
    {
      agentId: "agent_generic",
      command: genericCommand,
      versionArgs: ["--version"],
      promptMechanisms: ["stdin"],
      defaultPromptMechanism: "stdin",
      roles: ["validation"],
      supportsMcp: false,
      supportsHooks: false,
      localOnlyBehavior:
        "Runs only the operator-supplied local command that reads prompt text from stdin.",
      installHints: [
        "Set FULCRUM_GENERIC_AGENT_COMMAND to a local executable that accepts prompt text on stdin."
      ]
    }
  ];
}

export function listAgentProfiles(): AgentProfile[] {
  return buildAgentProfiles().map((profile) => ({
    ...profile,
    installHints: [...profile.installHints],
    promptMechanisms: [...profile.promptMechanisms],
    roles: [...profile.roles],
    rejectedCommands: profile.rejectedCommands ? [...profile.rejectedCommands] : undefined
  }));
}

export function getAgentProfile(agentId: string): AgentProfile | undefined {
  return listAgentProfiles().find((profile) => profile.agentId === agentId);
}
