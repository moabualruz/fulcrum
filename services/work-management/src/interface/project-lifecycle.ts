import type { EntityManager } from "typeorm";

import type {
  ProjectOption,
  ProjectOverviewData,
} from "@work-management/application/projects/queries.ts";
import type {
  ProjectSetupInput,
  ProjectSetupResult,
} from "@work-management/application/projects/commands.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export type {
  ProjectOption,
  ProjectOverviewData,
  ProjectSetupInput,
  ProjectSetupResult,
};

export async function listProjectOptions(em: EntityManager, ctx: AppContext): Promise<ProjectOption[]> {
  const queries = await import("@work-management/application/projects/queries.ts");
  return queries.listProjectOptions(em, ctx);
}

export async function createProject(
  em: EntityManager,
  ctx: AppContext,
  input: {
    slug: string;
    name: string;
    description?: string | null;
    parentId?: string | null;
    kind?: "workspace" | "project" | "subproject";
    modulePolicy?: Record<string, unknown>;
    templateId?: string | null;
    workflowId?: string | null;
  },
): Promise<{ id: string; slug: string; name: string; parentId: string | null; kind: string; path: string; depth: number }> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.createProject(em, ctx, input);
}

export async function createProjectFromSetup(
  em: EntityManager,
  ctx: AppContext,
  input: ProjectSetupInput,
): Promise<ProjectSetupResult> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.createProjectFromSetup(em, ctx, input);
}

export async function loadProjectOverview(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
  options: { includeDescendants?: boolean } = {},
): Promise<ProjectOverviewData | null> {
  const queries = await import("@work-management/application/projects/queries.ts");
  return queries.loadProjectOverview(em, ctx, projectId, options);
}

export async function updateProject(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; name?: string; description?: string | null },
): Promise<{ ok: true }> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.updateProject(em, ctx, input);
}

export async function deleteProject(em: EntityManager, ctx: AppContext, id: string): Promise<{ ok: true }> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.deleteProject(em, ctx, id);
}
