import type { EntityManager } from "@mikro-orm/postgresql";

import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { appendEventOrm, ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext } from "../tasks/types.ts";
import { addProjectRepo, linkProjectRepoToProject } from "../repos/commands.ts";
import { loadTemplateSource, normalizeTemplate, type NormalizedTemplate } from "../templates/engine.ts";
import type { TemplateTrustMode } from "../project-policy/trust.ts";

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
  const id = randomUUID();
  const parent = input.parentId ? await loadProjectHierarchyParent(em, ctx, input.parentId) : null;
  const kind = input.kind ?? (parent ? "subproject" : "project");
  const path = parent ? `${parent.path}/${input.slug}` : input.slug;
  const depth = parent ? parent.depth + 1 : 0;
  await ormSqlConnection(em).execute(
    `INSERT INTO projects (id, org_id, slug, name, description, parent_id, kind, path, depth, module_policy, template_id, workflow_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, now(), now())`,
    [
      id,
      ctx.orgId,
      input.slug,
      input.name,
      input.description ?? null,
      input.parentId ?? null,
      kind,
      path,
      depth,
      JSON.stringify(input.modulePolicy ?? {}),
      input.templateId ?? null,
      input.workflowId ?? null,
    ],
  );
  await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: id,
    actor: "system",
    subjectKind: "project",
    subjectId: id,
    verb: "created",
  });
  return { id, slug: input.slug, name: input.name, parentId: input.parentId ?? null, kind, path, depth };
}

export interface ProjectSetupInput {
  name: string;
  slug?: string;
  description?: string | null;
  kind?: "workspace" | "project" | "subproject";
  parentId?: string | null;
  repoPath?: string | null;
  template?: string | null;
  trustMode?: TemplateTrustMode;
}

export interface ProjectSetupResult {
  links: {
    project: { id: string; slug: string; path: string };
    repo: { id: string; localPath: string | null; syncStatus: string };
    workflow: { id: string };
  };
  template: NormalizedTemplate;
  trace: { audit: string };
}

export async function createProjectFromSetup(
  em: EntityManager,
  ctx: AppContext,
  input: ProjectSetupInput,
): Promise<ProjectSetupResult> {
  const templateId = input.template ?? "agent-os-software-project";
  const template = normalizeTemplate(await loadTemplateSource({ kind: "built-in", id: templateId }));
  const project = await createProject(em, ctx, {
    slug: input.slug ?? slugFromName(input.name),
    name: input.name,
    description: input.description ?? null,
    parentId: input.parentId ?? null,
    kind: input.kind,
    templateId: template.id,
    workflowId: template.workflow.id,
    modulePolicy: { trustMode: input.trustMode ?? "manual", inherited: input.parentId ? true : false },
  });
  const resolvedRepoPath = input.repoPath ? await normalizeExistingDirectory(input.repoPath) : null;
  const repo = resolvedRepoPath
    ? await addProjectRepo(em, { ...ctx, projectId: project.id }, { kind: "local", path: resolvedRepoPath, name: input.name })
    : { id: "" };
  if (repo.id) await linkProjectRepoToProject(em, { ...ctx, projectId: project.id }, repo.id);
  const audit = `evt-${randomUUID()}`;
  await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: project.id,
    actor: ctx.userId ?? "system",
    subjectKind: "project_setup",
    subjectId: project.id,
    verb: "project.setup.completed",
    payload: { repoId: repo.id || null, templateId: template.id, trustMode: input.trustMode ?? "manual", audit },
  });
  return {
    links: {
      project: { id: project.id, slug: project.slug, path: project.path },
      repo: { id: repo.id, localPath: resolvedRepoPath, syncStatus: repo.id ? "idle" : "missing" },
      workflow: { id: template.workflow.id },
    },
    template,
    trace: { audit },
  };
}

export async function updateProject(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; name?: string; description?: string | null },
): Promise<{ ok: true }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description);
    sets.push(`description = $${params.length}`);
  }
  if (sets.length === 0) return { ok: true };
  params.push(input.id, ctx.orgId);
  await ormSqlConnection(em).execute(
    `UPDATE projects SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length - 1} AND org_id = $${params.length}`,
    params,
  );
  return { ok: true };
}

async function loadProjectHierarchyParent(
  em: EntityManager,
  ctx: AppContext,
  parentId: string,
): Promise<{ id: string; path: string; depth: number }> {
  const rows = await ormSqlConnection(em).execute<Array<{ id: string; path: string | null; depth: number | string; slug: string }>>(
    `SELECT id, path, depth, slug FROM projects WHERE id = $1 AND org_id = $2`,
    [parentId, ctx.orgId],
  );
  const row = rows[0];
  if (!row) throw new Error("parent project not found");
  return { id: row.id, path: row.path ?? row.slug, depth: Number(row.depth) };
}

async function normalizeExistingDirectory(path: string): Promise<string> {
  const resolved = resolve(path);
  await access(resolved);
  return resolved;
}

function slugFromName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

export async function deleteProject(em: EntityManager, ctx: AppContext, id: string): Promise<{ ok: true }> {
  const conn = ormSqlConnection(em);
  await conn.execute(`DELETE FROM events WHERE project_id = $1 AND org_id = $2`, [id, ctx.orgId]);
  await conn.execute(`DELETE FROM projects WHERE id = $1 AND org_id = $2`, [id, ctx.orgId]);
  return { ok: true };
}

export async function rescheduleProjectTask(
  em: EntityManager,
  ctx: AppContext,
  input: { taskId: string; startDate?: string | null; dueDate?: string | null },
): Promise<{ ok: true }> {
  if (!input.taskId) throw new Error("task id required");
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.startDate !== undefined) {
    params.push(input.startDate);
    sets.push(`start_date = $${params.length}`);
  }
  if (input.dueDate !== undefined) {
    params.push(input.dueDate);
    sets.push(`due_date = $${params.length}`);
  }
  if (sets.length === 0) return { ok: true };
  params.push(input.taskId, ctx.orgId, ctx.projectId ?? null);
  const rows = await ormSqlConnection(em).execute<Array<{ id: string }>>(
    `UPDATE tasks
        SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length - 2}
        AND org_id = $${params.length - 1}
        AND project_id = $${params.length}
        AND deleted_at IS NULL
      RETURNING id`,
    params,
  );
  if (!rows[0]) throw new Error("task not found");
  return { ok: true };
}

export async function createProjectTask(
  em: EntityManager,
  ctx: AppContext,
  input: { title: string; status?: string | null; sprintId?: string | null },
): Promise<{ id: string }> {
  const id = randomUUID();
  await ormSqlConnection(em).execute(
    `INSERT INTO tasks (id, org_id, project_id, title, status, sprint_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
    [id, ctx.orgId, ctx.projectId ?? null, input.title, input.status ?? "pending", input.sprintId ?? null],
  );
  return { id };
}

export async function updateProjectTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  patch: { title?: string; status?: string | null; priority?: number | null; description?: string | null },
): Promise<{ ok: true }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of [["title", "title"], ["status", "status"], ["priority", "priority"], ["description", "description"]] as const) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (sets.length === 0) return { ok: true };
  params.push(taskId, ctx.orgId);
  await ormSqlConnection(em).execute(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length - 1} AND org_id = $${params.length}`,
    params,
  );
  return { ok: true };
}

export async function deleteProjectTask(em: EntityManager, ctx: AppContext, taskId: string): Promise<{ ok: true }> {
  await ormSqlConnection(em).execute(
    `UPDATE tasks SET deleted_at = now(), updated_at = now() WHERE id = $1 AND org_id = $2`,
    [taskId, ctx.orgId],
  );
  return { ok: true };
}
