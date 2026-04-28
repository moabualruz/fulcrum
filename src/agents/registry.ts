// Single source of truth for per-agent metadata used by install, doctor, and
// skills sync. Adding a new agent or changing a path only requires editing here.

export interface Agent {
  id: "claude-code" | "codex" | "gemini" | "opencode" | "pi";
  /** Human-readable display name. */
  label: string;
  /** Primary agent config directory, e.g. ~/.claude. */
  baseDir: (home: string) => string;
  /** File that receives the <!-- BEGIN/END FULCRUM RULES --> sentinel splice. */
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
    rulesFile:        (home) => `${home}/.claude/CLAUDE.md`,
    skillsDir:        (home) => `${home}/.claude/skills`,
    cavemanInstallDir:(home) => `${home}/.claude/plugins/cache/caveman/caveman`,
    settingsPath:     (home) => `${home}/.claude/settings.json`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    baseDir:          (home) => `${home}/.codex`,
    rulesFile:        (home) => `${home}/.codex/AGENTS.md`,
    skillsDir:        (home) => `${home}/.codex/skills`,
    cavemanInstallDir:(home) => `${home}/.codex/skills/caveman`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    baseDir:          (home) => `${home}/.gemini`,
    // The GEMINI.md in ~/.gemini/ contains `@AGENTS.md` — the actual rules
    // content lives in ~/AGENTS.md (the @-import target). Doctor checks that
    // ~/AGENTS.md contains the sentinel to confirm rules are spliced.
    rulesFile:        (home) => `${home}/AGENTS.md`,
    // Gemini uses an extension namespace: ~/.gemini/extensions/fulcrum-skills/skills/
    skillsDir:        (home) => `${home}/.gemini/extensions/fulcrum-skills/skills`,
    cavemanInstallDir:(home) => `${home}/.gemini/extensions/caveman`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    baseDir:          (home) => `${home}/.config/opencode`,
    rulesFile:        (home) => `${home}/.config/opencode/AGENTS.md`,
    skillsDir:        (home) => `${home}/.config/opencode/skills`,
    cavemanInstallDir:(home) => `${home}/.config/opencode/skills/caveman`,
  },
  {
    id: "pi",
    label: "Pi CLI",
    baseDir:          (home) => `${home}/.pi/agent`,
    rulesFile:        (home) => `${home}/.pi/agent/AGENTS.md`,
    skillsDir:        (home) => `${home}/.pi/agent/skills`,
    cavemanInstallDir:(home) => `${home}/.pi/agent/skills/caveman`,
  },
] as const;
