import type { EntityManager } from "@mikro-orm/postgresql";

import { SprintService } from "../../services/SprintService.ts";
import { AppValidationError } from "../errors.ts";
import type {
  AppContext,
  CloseSprintDto,
  CloseSprintInput,
  CreateSprintInput,
  SprintDto,
  UpdateSprintInput,
} from "./types.ts";

export async function createSprint(em: EntityManager, ctx: AppContext, input: CreateSprintInput): Promise<SprintDto> {
  if (!input.name?.trim()) throw new AppValidationError("Sprint name is required.");
  if (!input.projectId) throw new AppValidationError("Sprint projectId is required.");
  if (input.startDate >= input.endDate) throw new AppValidationError("Sprint startDate must be before endDate.");
  return new SprintService(em).create(ctx.orgId, input);
}

export async function updateSprint(em: EntityManager, ctx: AppContext, input: UpdateSprintInput): Promise<SprintDto | null> {
  return new SprintService(em).update(ctx.orgId, input);
}

export async function deleteSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto | null> {
  return new SprintService(em).delete(ctx.orgId, id);
}

export async function startSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto> {
  return new SprintService(em).start({ orgId: ctx.orgId, em }, id);
}

export async function closeSprint(em: EntityManager, ctx: AppContext, input: CloseSprintInput): Promise<CloseSprintDto> {
  return new SprintService(em).close({ orgId: ctx.orgId, em }, input);
}

export async function addTaskToSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  taskId: string,
): Promise<{ moved: true }> {
  return new SprintService(em).addTask(ctx.orgId, sprintId, taskId);
}

export async function removeTaskFromSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  taskId: string,
): Promise<{ moved: true }> {
  return new SprintService(em).removeTask(ctx.orgId, sprintId, taskId);
}
