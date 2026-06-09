// Single source of truth for per-agent metadata used by install, doctor, and
// skills sync. Adding a new agent or changing a path only requires editing here.

import { AgentProfileSchema, type AgentProfile } from "./types.ts";
import { claudeCodeProfile } from "./profiles/claude-code.ts";
import { codexProfile } from "./profiles/codex.ts";
import { copilotProfile } from "./profiles/copilot.ts";
import { geminiCliProfile } from "./profiles/gemini-cli.ts";
import { opencodeProfile } from "./profiles/opencode.ts";
import { piProfile } from "./profiles/pi.ts";

export interface Agent {
  id: "claude-code" | "codex" | "gemini" | "opencode" | "pi";
  /** Human-readable display name. */
  label: string;
  /** Primary agent config directory, e.g. ~/.claude. */
  baseDir: (home: string) => string;
  /**
   * Root directory whose *existence* signals that this agent is installed on
   * the current machine. Used by detection-aware commands (hooks enable/disable)
   * to skip writing config files for agents that are absent.
   */
  rootDir: (home: string) => string;
  /** File that receives the <!-- BEGIN/END FULCRUM RULES --> loader block. */
  rulesFile: (home: string) => string;
  /**
   * Parent directory for synced skills. Install places skills under
   * `<skillsDir(home)>/fulcrum/<name>/` (or, for Gemini, directly under the
   * extension namespace which already carries the "fulcrum-skills" prefix).
   */
  skillsDir: (home: string) => string;
  /**
   * Path whose *existence* signals that caveman is already installed for this
   * agent. Doctor and install use this for skip/detect logic.
   */
  cavemanInstallDir: (home: string) => string;
  /**
   * Optional: path to the agent's settings file. Currently only Claude Code
   * exposes one (`~/.claude/settings.json`). Doctor reads it to detect the
   * caveman activation hook.
   */
  settingsPath?: (home: string) => string;
}

export const AGENTS: readonly Agent[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    baseDir:          (home) => `${home}/.claude`,
    rootDir:          (home) => `${home}/.claude`,
    rulesFile:        (home) => `${home}/.claude/CLAUDE.md`,
    skillsDir:        (home) => `${home}/.claude/skills`,
    cavemanInstallDir:(home) => `${home}/.claude/plugins/cache/caveman/caveman`,
    settingsPath:     (home) => `${home}/.claude/settings.json`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    baseDir:          (home) => `${home}/.codex`,
    rootDir:          (home) => `${home}/.codex`,
    rulesFile:        (home) => `${home}/.codex/AGENTS.md`,
    skillsDir:        (home) => `${home}/.codex/skills`,
    cavemanInstallDir:(home) => `${home}/.codex/skills/caveman`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    baseDir:          (home) => `${home}/.gemini`,
    rootDir:          (home) => `${home}/.gemini`,
    // Gemini reads GEMINI.md and supports @ imports. Fulcrum installs the
    // loader block there with a direct import to ~/.fulcrum/rules/AGENTS.md.
    rulesFile:        (home) => `${home}/.gemini/GEMINI.md`,
    // Gemini uses an extension namespace: ~/.gemini/extensions/fulcrum-skills/skills/
    skillsDir:        (home) => `${home}/.gemini/extensions/fulcrum-skills/skills`,
    cavemanInstallDir:(home) => `${home}/.gemini/extensions/caveman`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    baseDir:          (home) => `${home}/.config/opencode`,
    rootDir:          (home) => `${home}/.config/opencode`,
    rulesFile:        (home) => `${home}/.config/opencode/AGENTS.md`,
    skillsDir:        (home) => `${home}/.config/opencode/skills`,
    cavemanInstallDir:(home) => `${home}/.config/opencode/skills/caveman`,
  },
  {
    id: "pi",
    label: "Pi CLI",
    baseDir:          (home) => `${home}/.pi/agent`,
    rootDir:          (home) => `${home}/.pi/agent`,
    rulesFile:        (home) => `${home}/.pi/agent/AGENTS.md`,
    skillsDir:        (home) => `${home}/.pi/agent/skills`,
    cavemanInstallDir:(home) => `${home}/.pi/agent/skills/caveman`,
  },
] as const;

const PROFILE_DEFINITIONS: readonly AgentProfile[] = [
  claudeCodeProfile,
  codexProfile,
  copilotProfile,
  geminiCliProfile,
  opencodeProfile,
  piProfile,
] as const;

export class UnknownAgentError extends Error {
  constructor(name: string, knownNames: readonly string[]) {
    super(`Unknown agent profile '${name}'. Known profiles: ${knownNames.join(", ")}`);
    this.name = "UnknownAgentError";
  }
}

export function createProfileRegistry(profiles: readonly unknown[]) {
  const validatedProfiles = profiles.map((profile) => AgentProfileSchema.parse(profile));
  const profilesByName = new Map<string, AgentProfile>();

  for (const profile of validatedProfiles) {
    if (profilesByName.has(profile.name)) {
      throw new Error(`Duplicate agent profile '${profile.name}'`);
    }
    profilesByName.set(profile.name, profile);
  }

  const knownNames = [...profilesByName.keys()].sort();

  return {
    getProfile(name: string): AgentProfile {
      const profile = profilesByName.get(name);
      if (!profile) throw new UnknownAgentError(name, knownNames);
      return profile;
    },
    listProfiles(): AgentProfile[] {
      return knownNames.map((name) => profilesByName.get(name)!);
    },
  };
}

const PROFILE_REGISTRY = createProfileRegistry(PROFILE_DEFINITIONS);

export function getProfile(name: string): AgentProfile {
  return PROFILE_REGISTRY.getProfile(name);
}

export function listProfiles(): AgentProfile[] {
  return PROFILE_REGISTRY.listProfiles();
}
