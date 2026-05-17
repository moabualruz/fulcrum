import type { EntityManager } from "typeorm";

import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { Project } from "@work-management/infrastructure/database/entities/tasks/Project.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { resolveOrgId } from "@identity-access/application/auth/org-context.ts";

export interface RequestScopeReferences {
  orgId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  runId?: string | null;
}

export async function resolveRequestOrgId(
  em: EntityManager,
  refs: RequestScopeReferences,
): Promise<string> {
  return await resolveOrgId(
    em,
    refs.orgId
      ?? await inferOrgIdFromProject(em, refs.projectId)
      ?? await inferOrgIdFromTask(em, refs.taskId)
      ?? await inferOrgIdFromRun(em, refs.runId),
  );
}

async function inferOrgIdFromRun(
  em: EntityManager,
  runId: string | null | undefined,
): Promise<string | null> {
  const id = runId?.trim();
  if (!id) return null;
  const run = await em.findOne(AgentRun, { where: { id } as never });
  return run?.org.id ?? null;
}

async function inferOrgIdFromProject(
  em: EntityManager,
  projectId: string | null | undefined,
): Promise<string | null> {
  const id = projectId?.trim();
  if (!id) return null;
  const project = await em.findOne(Project, { where: { id } as never });
  return project?.org.id ?? null;
}

async function inferOrgIdFromTask(
  em: EntityManager,
  taskId: string | null | undefined,
): Promise<string | null> {
  const id = taskId?.trim();
  if (!id) return null;
  const task = await em.findOne(Task, { where: { id } as never });
  return task?.org.id ?? null;
}
