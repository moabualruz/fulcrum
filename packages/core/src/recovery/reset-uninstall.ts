import { join } from "node:path";
import { makeId, type PolicyDecision } from "@fulcrum/shared";
import type { PolicyEnforcementService } from "../policy/enforcement.js";

export interface DestructivePreview {
  previewId: string;
  action: "reset" | "uninstall";
  remove: string[];
  preserve: string[];
  purge: string[];
  requiresConfirmation: boolean;
  policyDecision?: PolicyDecision;
  guarantees: string[];
}

export class ResetUninstallPreviewService {
  constructor(private readonly policy?: PolicyEnforcementService) {}

  preview(request: {
    action: "reset" | "uninstall";
    stateRoot: string;
    purgeBackups?: boolean;
    requester?: string;
  }): DestructivePreview {
    const previewId = makeId("preview", `${request.action}-${request.stateRoot}`);
    const purge = request.purgeBackups ? [join(request.stateRoot, "backups")] : [];
    const remove =
      request.action === "reset"
        ? [join(request.stateRoot, "cache"), join(request.stateRoot, "derived")]
        : [join(request.stateRoot, "fulcrum.sqlite"), join(request.stateRoot, "cache")];
    const preserve = [
      join(request.stateRoot, "backups"),
      join(request.stateRoot, "artifacts"),
      "registered project worktrees and repositories"
    ].filter((entry) => !purge.includes(entry));
    const policyDecision = this.policy?.check({
      action: request.purgeBackups ? "backup_purge" : "destructive",
      subjectType: request.action,
      subjectId: previewId,
      requester: request.requester ?? "operator",
      preview: true,
      localOnly: true,
      previewRef: previewId
    }).decision;
    return {
      previewId,
      action: request.action,
      remove,
      preserve,
      purge,
      requiresConfirmation: true,
      policyDecision,
      guarantees: [
        "Backups are preserved unless purge is explicitly approved.",
        "User repositories and worktrees are never removed by preview.",
        "Canonical state removal requires explicit confirmation."
      ]
    };
  }
}
