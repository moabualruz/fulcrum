import type { EntityManager } from "typeorm";

import type {
  CreateStatusInput,
  ProjectStatusRow,
  UpdateStatusInput,
} from "@work-management/application/project-statuses/commands.ts";

export type {
  CreateStatusInput,
  ProjectStatusRow,
  UpdateStatusInput,
};

export async function createProjectStatus(
  em: EntityManager,
  input: CreateStatusInput,
): Promise<{ id: string }> {
  const service = await import("@work-management/application/project-statuses/commands.ts");
  return service.createProjectStatus(em, input);
}

export async function updateProjectStatus(
  em: EntityManager,
  input: UpdateStatusInput,
): Promise<{ ok: true }> {
  const service = await import("@work-management/application/project-statuses/commands.ts");
  return service.updateProjectStatus(em, input);
}

export async function deleteProjectStatus(em: EntityManager, id: string): Promise<{ ok: true }> {
  const service = await import("@work-management/application/project-statuses/commands.ts");
  return service.deleteProjectStatus(em, id);
}

export async function listProjectStatuses(
  em: EntityManager,
  projectId: string,
): Promise<ProjectStatusRow[]> {
  const service = await import("@work-management/application/project-statuses/commands.ts");
  return service.listProjectStatuses(em, projectId);
}
