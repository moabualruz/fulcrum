import type { EntityManager } from "typeorm";

import type {
  OrchestrationConfigRow,
  OrchestrationDashboardData,
  ProjectOption,
  WorkflowDefRow,
} from "@execution-orchestration/application/orchestration/queries.ts";
import type { OrchestrationApplicationContext } from "@execution-orchestration/application/orchestration/types.ts";

export type {
  OrchestrationApplicationContext,
  OrchestrationConfigRow,
  OrchestrationDashboardData,
  ProjectOption,
  WorkflowDefRow,
};

export async function loadOrchestrationDashboard(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  projectId?: string,
): Promise<OrchestrationDashboardData> {
  const queries = await import("@execution-orchestration/application/orchestration/queries.ts");
  return queries.loadOrchestrationDashboard(em, ctx, projectId);
}

export async function listOrchestrationProjectOptions(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
): Promise<ProjectOption[]> {
  const queries = await import("@execution-orchestration/application/orchestration/queries.ts");
  return queries.listOrchestrationProjectOptions(em, ctx);
}

export async function loadOrchestrationConfig(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
): Promise<OrchestrationConfigRow | null> {
  const queries = await import("@execution-orchestration/application/orchestration/queries.ts");
  return queries.loadOrchestrationConfig(em, ctx);
}

export async function listWorkflowDefs(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
): Promise<WorkflowDefRow[]> {
  const queries = await import("@execution-orchestration/application/orchestration/queries.ts");
  return queries.listWorkflowDefs(em, ctx);
}

export async function loadWorkflowDef(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  id: string,
): Promise<WorkflowDefRow | null> {
  const queries = await import("@execution-orchestration/application/orchestration/queries.ts");
  return queries.loadWorkflowDef(em, ctx, id);
}

export async function upsertOrchestrationConfig(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  config: {
    pollIntervalS: number;
    maxConcurrency: number;
    stallTimeoutS: number;
    workspaceRoot: string | null;
  },
): Promise<OrchestrationConfigRow> {
  const commands = await import("@execution-orchestration/application/orchestration/commands.ts");
  return commands.upsertOrchestrationConfig(em, ctx, config);
}

export async function upsertWorkflowDef(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  def: {
    id?: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    yamlConfig: string;
    promptTemplate: string;
  },
): Promise<WorkflowDefRow> {
  const commands = await import("@execution-orchestration/application/orchestration/commands.ts");
  return commands.upsertWorkflowDef(em, ctx, def);
}
