import type { EntityManager } from "typeorm";

import type { AppContext } from "@work-management/application/tasks/types.ts";
import type { IntakeStatus, ProjectModuleStatus } from "@work-management/application/pm-structure.ts";

export type {
  IntakeRequestRow,
  IntakeStatus,
  ProjectModuleRow,
  ProjectModuleStatus,
} from "@work-management/application/pm-structure.ts";

export async function listProjectModules(em: EntityManager, ctx: AppContext) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.listProjectModules(em, ctx);
}

export async function getProjectModule(em: EntityManager, ctx: AppContext, moduleId: string) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.getProjectModule(em, ctx, { moduleId });
}

export async function createProjectModule(
  em: EntityManager,
  ctx: AppContext,
  input: { name: string; status?: ProjectModuleStatus; leadUserId?: string | null },
) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.createProjectModule(em, ctx, input);
}

export async function updateProjectModule(
  em: EntityManager,
  ctx: AppContext,
  input: { moduleId: string; name?: string; status?: ProjectModuleStatus; leadUserId?: string | null },
) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.updateProjectModule(em, ctx, input);
}

export async function deleteProjectModule(em: EntityManager, ctx: AppContext, moduleId: string) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.deleteProjectModule(em, ctx, { moduleId });
}

export async function listIntakeRequests(em: EntityManager, ctx: AppContext) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.listIntakeRequests(em, ctx);
}

export async function getIntakeRequest(em: EntityManager, ctx: AppContext, intakeId: string) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.getIntakeRequest(em, ctx, { intakeId });
}

export async function createIntakeRequest(
  em: EntityManager,
  ctx: AppContext,
  input: { title: string; description?: string | null; source?: string },
) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.createIntakeRequest(em, ctx, input);
}

export async function updateIntakeRequest(
  em: EntityManager,
  ctx: AppContext,
  input: { intakeId: string; title?: string; description?: string | null; status?: IntakeStatus },
) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.updateIntakeRequest(em, ctx, input);
}

export async function deleteIntakeRequest(em: EntityManager, ctx: AppContext, intakeId: string) {
  const service = await import("@work-management/application/pm-structure.ts");
  return service.deleteIntakeRequest(em, ctx, { intakeId });
}
