import type { ExternalPmService } from "@fulcrum/core";

export async function importPlaneCommand(service: ExternalPmService, input: { projectId: string }) {
  return service.importWork(input);
}

export async function syncPlaneCommand(service: ExternalPmService, input: { projectId: string }) {
  return service.importWork(input);
}

export function listPlaneMirrorsCommand(service: ExternalPmService, projectId?: string) {
  return service.syncStatus(projectId);
}

export async function previewPlaneWritebackCommand(
  service: ExternalPmService,
  input: {
    mirrorId?: string;
    externalId: string;
    comment?: string;
    status?: string;
    localOnly?: boolean;
  }
) {
  return service.previewWriteback(input);
}

export async function disablePlaneCommand(service: ExternalPmService, reason: string) {
  return service.disable(reason);
}

export function linkPlaneTaskCommand(
  service: ExternalPmService,
  input: { mirrorId: string; taskId: string }
) {
  return service.linkTask(input);
}

export async function decidePlaneWritebackCommand(
  service: ExternalPmService,
  input: {
    mirrorId: string;
    decision: "approve" | "deny" | "postpone";
    policyDecisionId?: string;
    comment?: string;
    status?: string;
  }
) {
  return service.decideWriteback(input);
}
