import type { CapabilityHealthRecord, CapabilityProbe } from "@fulcrum/shared";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export type DoctorMode = "quick" | "deep";

export interface CapabilityProbeContext {
  mode: DoctorMode;
  noNetwork: boolean;
  projectPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: string;
  setupApplied?: boolean;
}

type ProbeDefinition = Omit<CapabilityProbe, "schemaVersion"> & {
  required?: boolean;
  args?: string[];
  projectFiles?: string[];
  envVars?: string[];
};

const QUICK_COMMAND_PROBES: ProbeDefinition[] = [
  commandProbe("cap_rg", "ripgrep", "rg", ["--version"], "code", false, "quick"),
  commandProbe("cap_fd", "fd", "fd", ["--version"], "code", false, "quick"),
  commandProbe("cap_ast_grep", "ast-grep", "ast-grep", ["--version"], "code", false, "quick"),
  commandProbe("cap_aider", "Aider", "aider", ["--version"], "agents", false, "quick"),
  commandProbe("cap_repomix", "Repomix", "repomix", ["--version"], "repo_pack", false, "quick"),
  commandProbe(
    "cap_git_worktree",
    "Git worktree",
    "git",
    ["worktree", "--help"],
    "worktree",
    true,
    "quick"
  )
];

const DEEP_COMMAND_PROBES: ProbeDefinition[] = [
  commandProbe("cap_memsearch", "memsearch", "memsearch", ["--version"], "memory", false, "deep"),
  commandProbe("cap_engram", "Engram", "engram", ["--version"], "memory", false, "deep")
];

const STATIC_PROBES: ProbeDefinition[] = [
  {
    capabilityId: "cap_event_log",
    name: "Event log",
    mode: "quick",
    probeKind: "file",
    blockingRule: "required_for_audit",
    privacyStatus: "local_only",
    affectedWorkflows: ["runs", "audit", "doctor"],
    nextActionTemplate: "Run setup apply to initialize local event log storage.",
    required: true
  },
  {
    capabilityId: "cap_quality_gates",
    name: "Quality gates",
    mode: "quick",
    probeKind: "config",
    target: "package.json",
    blockingRule: "required_for_release",
    privacyStatus: "local_only",
    affectedWorkflows: ["quality", "release", "doctor"],
    nextActionTemplate: "Add test/typecheck scripts before relying on release validation.",
    required: true
  },
  {
    capabilityId: "cap_redaction_config",
    name: "Redaction config",
    mode: "quick",
    probeKind: "config",
    target: "packages/policy/src/redaction.ts",
    blockingRule: "required_for_exports",
    privacyStatus: "local_only",
    affectedWorkflows: ["privacy", "exports", "doctor"],
    nextActionTemplate: "Configure redaction policy before exporting evidence.",
    required: true
  }
];

const PROJECT_PROBES: ProbeDefinition[] = [
  projectConfigProbe("cap_project_agents", "Project AGENTS.md", ["AGENTS.md"]),
  projectConfigProbe("cap_project_claude", "Project CLAUDE.md", [
    "CLAUDE.md",
    ".claude/settings.json"
  ]),
  projectConfigProbe("cap_project_gemini", "Project Gemini config", [
    "GEMINI.md",
    ".gemini/settings.json"
  ]),
  projectConfigProbe("cap_project_opencode", "Project OpenCode config", [
    "opencode.json",
    ".opencode.json"
  ]),
  projectConfigProbe("cap_project_codex", "Project Codex config", [
    ".codex/config.toml",
    "codex.md"
  ]),
  projectConfigProbe("cap_project_copilot_mcp", "Project Copilot MCP config", [
    ".github/copilot-instructions.md",
    ".vscode/mcp.json"
  ]),
  projectConfigProbe("cap_project_ignore_rules", "Project ignore rules", [
    ".gitignore",
    ".ignore",
    ".fulcrumignore",
    ".repomixignore"
  ])
];

const NETWORK_PROBES: ProbeDefinition[] = [
  {
    capabilityId: "cap_plane",
    name: "Plane",
    mode: "network",
    probeKind: "env",
    blockingRule: "optional_remote_adapter",
    privacyStatus: "operator_configured",
    affectedWorkflows: ["pm", "adapters"],
    nextActionTemplate: "Set PLANE_API_KEY and PLANE_BASE_URL to enable Plane live mode.",
    envVars: ["PLANE_API_KEY", "PLANE_BASE_URL"]
  },
  {
    capabilityId: "cap_observability",
    name: "Observability",
    mode: "network",
    probeKind: "env",
    blockingRule: "optional_remote_adapter",
    privacyStatus: "operator_configured",
    affectedWorkflows: ["observability", "doctor"],
    nextActionTemplate:
      "Configure observability endpoint explicitly if remote telemetry is required.",
    envVars: ["FULCRUM_OBSERVABILITY_URL"]
  },
  {
    capabilityId: "cap_remote_providers",
    name: "Remote providers",
    mode: "network",
    probeKind: "policy",
    blockingRule: "disabled_by_default",
    privacyStatus: "operator_configured",
    affectedWorkflows: ["agents", "adapters"],
    nextActionTemplate: "Approve remote provider policy before using remote model providers.",
    envVars: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
  }
];

export function capabilityProbeRegistry(
  mode: DoctorMode = "quick",
  projectPath?: string
): ProbeDefinition[] {
  return [
    ...QUICK_COMMAND_PROBES,
    ...(mode === "deep" ? DEEP_COMMAND_PROBES : []),
    ...STATIC_PROBES,
    ...(projectPath ? PROJECT_PROBES : []),
    ...NETWORK_PROBES
  ];
}

export function runCapabilityProbes(context: CapabilityProbeContext): CapabilityHealthRecord[] {
  const now = context.now ?? new Date().toISOString();
  const probes = capabilityProbeRegistry(context.mode, context.projectPath);
  return probes.map((probe) => runProbe(probe, context, now));
}

function runProbe(
  probe: ProbeDefinition,
  context: CapabilityProbeContext,
  now: string
): CapabilityHealthRecord {
  if (probe.mode === "network" && context.noNetwork) {
    return health(
      probe,
      "disabled",
      false,
      now,
      "No-network mode requested.",
      "Remote check skipped."
    );
  }
  if (probe.probeKind === "command" && probe.command) {
    return runCommandProbe(probe, context.env, now);
  }
  if (probe.probeKind === "env" || probe.probeKind === "policy") {
    const configured = (probe.envVars ?? []).some((name) =>
      Boolean(context.env?.[name] ?? process.env[name])
    );
    return health(
      probe,
      configured ? "managed" : "disabled",
      false,
      now,
      configured ? undefined : "Optional remote capability is not configured.",
      configured ? "Configured explicitly." : probe.nextActionTemplate
    );
  }
  if (probe.capabilityId === "cap_event_log" && !context.setupApplied) {
    return health(
      probe,
      "guided",
      false,
      now,
      "Setup has not initialized local event log storage.",
      probe.nextActionTemplate
    );
  }
  if (probe.probeKind === "config" && probe.target) {
    return existsSync(probe.target)
      ? health(probe, "managed", false, now, undefined, "Configuration detected.")
      : health(
          probe,
          probe.required ? "blocked" : "guided",
          Boolean(probe.required),
          now,
          `${probe.target} not found.`,
          probe.nextActionTemplate
        );
  }
  if (probe.projectFiles && context.projectPath) {
    const found = probe.projectFiles.some((file) => existsSync(join(context.projectPath!, file)));
    return found
      ? health(probe, "managed", false, now, undefined, "Project configuration detected.")
      : health(
          probe,
          "guided",
          false,
          now,
          "Project configuration not found.",
          probe.nextActionTemplate
        );
  }
  return health(probe, "managed", false, now, undefined, "No action needed.");
}

function runCommandProbe(
  probe: ProbeDefinition,
  env: NodeJS.ProcessEnv | undefined,
  now: string
): CapabilityHealthRecord {
  try {
    const output = execFileSync(probe.command!, probe.args ?? ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: env ? { ...process.env, ...env } : process.env
    }).trim();
    return health(
      probe,
      "managed",
      false,
      now,
      undefined,
      output ? `Detected ${firstLine(output)}.` : "Detected."
    );
  } catch {
    return health(
      probe,
      probe.required ? "blocked" : "guided",
      Boolean(probe.required),
      now,
      `${probe.command} is not available on PATH.`,
      probe.nextActionTemplate
    );
  }
}

function health(
  probe: ProbeDefinition,
  state: CapabilityHealthRecord["state"],
  blocking: boolean,
  freshness: string,
  cause: string | undefined,
  nextAction: string
): CapabilityHealthRecord {
  return {
    capabilityId: probe.capabilityId,
    state,
    blocking,
    cause,
    nextAction,
    privacyStatus: probe.privacyStatus,
    affectedWorkflows: probe.affectedWorkflows,
    freshness
  };
}

function commandProbe(
  capabilityId: string,
  name: string,
  command: string,
  args: string[],
  workflow: string,
  required: boolean,
  mode: DoctorMode
): ProbeDefinition {
  return {
    capabilityId,
    name,
    mode,
    probeKind: "command",
    command,
    blockingRule: required ? "required" : "optional",
    privacyStatus: "local_only",
    affectedWorkflows: [workflow, "doctor"],
    nextActionTemplate: `Install ${name} or disable workflows that depend on it.`,
    required,
    args
  };
}

function projectConfigProbe(
  capabilityId: string,
  name: string,
  projectFiles: string[]
): ProbeDefinition {
  return {
    capabilityId,
    name,
    mode: "project",
    probeKind: "config",
    blockingRule: "project_guidance",
    privacyStatus: "local_only",
    affectedWorkflows: ["project", "mcp", "agents", "doctor"],
    nextActionTemplate: `Add ${name} when this project uses that agent surface.`,
    projectFiles
  };
}

function firstLine(output: string): string {
  return output.split(/\r?\n/, 1)[0] ?? output;
}
