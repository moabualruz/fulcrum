export type DestructiveSeverity = "moderate" | "severe";
export type DestructiveSurface = "cli" | "tui";

export interface DestructiveAction {
  id: string;
  surface: DestructiveSurface;
  commandOrKey: string;
  targetIdField: string;
  severity: DestructiveSeverity;
  safety: readonly string[];
  outputRequirement: string;
}

export const DESTRUCTIVE_ACTIONS = [
  {
    id: "cli:uninstall",
    surface: "cli",
    commandOrKey: "fulcrum uninstall --dry-run|--purge",
    targetIdField: "FULCRUM_HOME",
    severity: "severe",
    safety: ["--dry-run", "--purge explicit flag", "prints target paths"],
    outputRequirement: "Names every managed path and never removes user-edited policy unless purge is explicit.",
  },
  {
    id: "cli:artifact-delete-hard",
    surface: "cli",
    commandOrKey: "fulcrum artifacts delete --id <artifactId> --hard --confirm <artifactId>",
    targetIdField: "artifactId",
    severity: "severe",
    safety: ["--confirm <artifactId>", "--hard explicit flag"],
    outputRequirement: "Names artifact id and does not print artifact body.",
  },
  {
    id: "cli:credential-archive",
    surface: "cli",
    commandOrKey: "fulcrum credentials archive --name <name> --confirm <name>",
    targetIdField: "credentialName",
    severity: "severe",
    safety: ["--confirm <name>", "redact secret values"],
    outputRequirement: "Names credential key only and never prints value/new-value.",
  },
  {
    id: "cli:credential-remove",
    surface: "cli",
    commandOrKey: "fulcrum credentials remove --name <name> --confirm <name>",
    targetIdField: "credentialName",
    severity: "severe",
    safety: ["--confirm <name>", "redact secret values"],
    outputRequirement: "Names credential key only and never prints value/new-value.",
  },
  {
    id: "cli:credential-rotate",
    surface: "cli",
    commandOrKey: "fulcrum credentials rotate --name <name> --new-value <value> --confirm <name>",
    targetIdField: "credentialName",
    severity: "severe",
    safety: ["--confirm <name>", "redact secret values"],
    outputRequirement: "Names credential key only and never prints value/new-value.",
  },
  {
    id: "cli:credential-set",
    surface: "cli",
    commandOrKey: "fulcrum credentials set --name <name> --value <value> --confirm <name>",
    targetIdField: "credentialName",
    severity: "severe",
    safety: ["--confirm <name>", "redact secret values"],
    outputRequirement: "Names credential key only and never prints value/new-value.",
  },
  {
    id: "tui:project-delete",
    surface: "tui",
    commandOrKey: "Projects d then y",
    targetIdField: "projectId",
    severity: "severe",
    safety: ["confirm-delete overlay", "y/N confirmation"],
    outputRequirement: "Names selected project before delete.",
  },
  {
    id: "tui:artifact-delete",
    surface: "tui",
    commandOrKey: "Artifacts D then y",
    targetIdField: "artifactId",
    severity: "severe",
    safety: ["delete overlay", "y/N confirmation"],
    outputRequirement: "Names every selected artifact before delete.",
  },
  {
    id: "tui:secret-delete",
    surface: "tui",
    commandOrKey: "Settings > Secrets D then y",
    targetIdField: "credentialId",
    severity: "severe",
    safety: ["confirm-delete overlay", "y/N confirmation", "redact secret values"],
    outputRequirement: "Names credential id/key only and never prints revealed value.",
  },
  {
    id: "tui:run-cancel",
    surface: "tui",
    commandOrKey: "Runs C",
    targetIdField: "runId",
    severity: "moderate",
    safety: ["selected row only", "visible run id", "status becomes cancelled"],
    outputRequirement: "Names run id in the row before cancellation.",
  },
] as const satisfies readonly DestructiveAction[];

export function listDestructiveActions(surface?: DestructiveSurface): readonly DestructiveAction[] {
  return surface ? DESTRUCTIVE_ACTIONS.filter((action) => action.surface === surface) : DESTRUCTIVE_ACTIONS;
}
