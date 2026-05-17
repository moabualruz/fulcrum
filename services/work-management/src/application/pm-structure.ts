import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";

import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export type ProjectModuleStatus = "planned" | "active" | "completed" | "archived";
export type IntakeStatus = "open" | "accepted" | "declined" | "converted";

export interface ProjectModuleRow {
  id: string;
  projectId: string;
  name: string;
  status: ProjectModuleStatus;
  leadUserId: string | null;
  traceId: string;
  taskCount: number;
}

export interface IntakeRequestRow {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: IntakeStatus;
  source: string;
  taskId: string | null;
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

interface ModulePolicy {
  pmModules?: ProjectModulePolicyRow[];
  [key: string]: unknown;
}

interface ProjectModulePolicyRow {
  id: string;
  name: string;
  status: ProjectModuleStatus;
  leadUserId: string | null;
  traceId: string;
}

export async function listProjectModules(
  em: EntityManager,
  ctx: AppContext,
  projectId = ctx.projectId,
): Promise<ProjectModuleRow[]> {
  const project = await loadProjectPolicy(em, ctx, requireProjectId(projectId));
  return moduleRows(project.projectId, project.policy);
}

export async function getProjectModule(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; moduleId: string },
): Promise<ProjectModuleRow | null> {
  const rows = await listProjectModules(em, ctx, input.projectId ?? ctx.projectId);
  return rows.find((row) => row.id === input.moduleId) ?? null;
}

export async function createProjectModule(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; name: string; status?: ProjectModuleStatus; leadUserId?: string | null },
): Promise<ProjectModuleRow> {
  const projectId = requireProjectId(input.projectId ?? ctx.projectId);
  const project = await loadProjectPolicy(em, ctx, projectId);
  const id = randomUUID();
  const module: ProjectModulePolicyRow = {
    id,
    name: input.name.trim(),
    status: input.status ?? "planned",
    leadUserId: input.leadUserId ?? null,
    traceId: `trace-module-${id}`,
  };
  if (!module.name) throw new Error("module name required");
  const modules = [...policyModules(project.policy), module];
  await saveProjectPolicy(em, ctx, projectId, { ...project.policy, pmModules: modules });
  return { ...module, projectId, taskCount: 0 };
}

export async function updateProjectModule(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; moduleId: string; name?: string; status?: ProjectModuleStatus; leadUserId?: string | null },
): Promise<ProjectModuleRow | null> {
  const projectId = requireProjectId(input.projectId ?? ctx.projectId);
  const project = await loadProjectPolicy(em, ctx, projectId);
  let updated: ProjectModulePolicyRow | null = null;
  const modules = policyModules(project.policy).map((module) => {
    if (module.id !== input.moduleId) return module;
    updated = {
      ...module,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.leadUserId !== undefined ? { leadUserId: input.leadUserId } : {}),
    };
    return updated;
  });
  if (!updated) return null;
  await saveProjectPolicy(em, ctx, projectId, { ...project.policy, pmModules: modules });
  return projectModuleRow(projectId, updated);
}

export async function deleteProjectModule(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; moduleId: string },
): Promise<{ ok: true }> {
  const projectId = requireProjectId(input.projectId ?? ctx.projectId);
  const project = await loadProjectPolicy(em, ctx, projectId);
  await saveProjectPolicy(em, ctx, projectId, {
    ...project.policy,
    pmModules: policyModules(project.policy).filter((module) => module.id !== input.moduleId),
  });
  return { ok: true };
}

export async function listIntakeRequests(
  em: EntityManager,
  ctx: AppContext,
  projectId = ctx.projectId,
): Promise<IntakeRequestRow[]> {
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    status: string | null;
    custom_fields: Record<string, unknown> | string | null;
    created_at: string | Date;
    updated_at: string | Date;
  }>>(
    `SELECT id, project_id, title, description, status, custom_fields, created_at, updated_at
       FROM tasks
      WHERE org_id = $1
        AND project_id = $2
        AND deleted_at IS NULL
        AND custom_fields->>'pmIntake' = 'true'
      ORDER BY created_at DESC, id DESC`,
    [ctx.orgId, requireProjectId(projectId)],
  );
  return rows.map(intakeRowFromTask);
}

export async function getIntakeRequest(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; intakeId: string },
): Promise<IntakeRequestRow | null> {
  const rows = await listIntakeRequests(em, ctx, input.projectId ?? ctx.projectId);
  return rows.find((row) => row.id === input.intakeId) ?? null;
}

export async function createIntakeRequest(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; title: string; description?: string | null; source?: string },
): Promise<IntakeRequestRow> {
  const id = randomUUID();
  const projectId = requireProjectId(input.projectId ?? ctx.projectId);
  const traceId = `trace-intake-${id}`;
  const title = input.title.trim();
  if (!title) throw new Error("intake title required");
  const customFields = {
    pmIntake: true,
    intakeStatus: "open",
    source: input.source ?? "manual",
    traceId,
  };
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    status: string | null;
    custom_fields: Record<string, unknown> | string | null;
    created_at: string | Date;
    updated_at: string | Date;
  }>>(
    `INSERT INTO tasks (id, org_id, project_id, title, description, status, task_type, external_id, custom_fields, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'backlog', 'story', $6, $7::jsonb, now(), now())
     RETURNING id, project_id, title, description, status, custom_fields, created_at, updated_at`,
    [id, ctx.orgId, projectId, title, input.description ?? null, `intake:${id}`, JSON.stringify(customFields)],
  );
  return intakeRowFromTask(rows[0]!);
}

export async function updateIntakeRequest(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; intakeId: string; title?: string; description?: string | null; status?: IntakeStatus },
): Promise<IntakeRequestRow | null> {
  const current = await getIntakeRequest(em, ctx, { projectId: input.projectId ?? ctx.projectId, intakeId: input.intakeId });
  if (!current) return null;
  const customFields = {
    pmIntake: true,
    intakeStatus: input.status ?? current.status,
    source: current.source,
    traceId: current.traceId,
  };
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    status: string | null;
    custom_fields: Record<string, unknown> | string | null;
    created_at: string | Date;
    updated_at: string | Date;
  }>>(
    `UPDATE tasks
        SET title = $1,
            description = $2,
            custom_fields = $3::jsonb,
            updated_at = now()
      WHERE id = $4 AND org_id = $5 AND project_id = $6 AND deleted_at IS NULL
      RETURNING id, project_id, title, description, status, custom_fields, created_at, updated_at`,
    [
      input.title?.trim() || current.title,
      input.description !== undefined ? input.description : current.description,
      JSON.stringify(customFields),
      input.intakeId,
      ctx.orgId,
      requireProjectId(input.projectId ?? ctx.projectId),
    ],
  );
  return rows[0] ? intakeRowFromTask(rows[0]) : null;
}

export async function deleteIntakeRequest(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId?: string | null; intakeId: string },
): Promise<{ ok: true }> {
  await ormSqlConnection(em).execute(
    `UPDATE tasks SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND org_id = $2 AND project_id = $3`,
    [input.intakeId, ctx.orgId, requireProjectId(input.projectId ?? ctx.projectId)],
  );
  return { ok: true };
}

function requireProjectId(projectId: string | null | undefined): string {
  if (!projectId) throw new Error("project id required");
  return projectId;
}

async function loadProjectPolicy(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<{ projectId: string; policy: ModulePolicy }> {
  const rows = await ormSqlConnection(em).execute<Array<{ id: string; module_policy: Record<string, unknown> | string | null }>>(
    `SELECT id, module_policy FROM projects WHERE id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  const row = rows[0];
  if (!row) throw new Error("project not found");
  return { projectId: row.id, policy: objectValue(row.module_policy) as ModulePolicy };
}

async function saveProjectPolicy(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
  policy: ModulePolicy,
): Promise<void> {
  await ormSqlConnection(em).execute(
    `UPDATE projects SET module_policy = $1::jsonb, updated_at = now() WHERE id = $2 AND org_id = $3`,
    [JSON.stringify(policy), projectId, ctx.orgId],
  );
}

function policyModules(policy: ModulePolicy): ProjectModulePolicyRow[] {
  return Array.isArray(policy.pmModules)
    ? policy.pmModules.filter(isProjectModulePolicyRow)
    : [];
}

function moduleRows(projectId: string, policy: ModulePolicy): ProjectModuleRow[] {
  return policyModules(policy).map((module) => projectModuleRow(projectId, module));
}

function projectModuleRow(projectId: string, module: ProjectModulePolicyRow): ProjectModuleRow {
  return { ...module, projectId, taskCount: 0 };
}

function intakeRowFromTask(row: {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  custom_fields: Record<string, unknown> | string | null;
  created_at: string | Date;
  updated_at: string | Date;
}): IntakeRequestRow {
  const customFields = objectValue(row.custom_fields);
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: intakeStatus(customFields["intakeStatus"]),
    source: typeof customFields["source"] === "string" ? customFields["source"] : "manual",
    taskId: row.id,
    traceId: typeof customFields["traceId"] === "string" ? customFields["traceId"] : `trace-intake-${row.id}`,
    createdAt: isoStamp(row.created_at),
    updatedAt: isoStamp(row.updated_at),
  };
}

function intakeStatus(value: unknown): IntakeStatus {
  return value === "accepted" || value === "declined" || value === "converted" ? value : "open";
}

function isProjectModulePolicyRow(value: unknown): value is ProjectModulePolicyRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string";
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return objectValue(parsed);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
