/**
 * Task detail application service.
 * Interface layers import this module or their local alias; SQL stays out of web/CLI/TUI.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import type { TaskStatus } from "../../services/tasks.ts";
import { TASK_STATUSES } from "../../services/tasks.ts";
import { eventDispatcher } from "../legacy/web-runtime.ts";
import { sqlAccess } from "../legacy/orm-web-adapter.ts";
import { getTask, listTasks } from "./queries.ts";
import type { AppContext, TaskDto } from "./types.ts";

export interface TaskDetail {
  id: string;
  org_id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface SubtaskRow {
  id: string;
  title: string;
  status: string;
  priority: number;
}

export interface EdgeRow {
  id: string;
  from_kind: string;
  from_id: string;
  to_kind: string;
  to_id: string;
  rel: string;
}

export interface EventRow {
  id: string;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskDetailPayload {
  task: TaskDetail;
  subtasks: SubtaskRow[];
  edges: EdgeRow[];
  events: EventRow[];
}

export type WorkModeId =
  | "planning"
  | "docs"
  | "repo-workspace"
  | "agent-run"
  | "knowledge"
  | "audit-activity";

export interface WorkModeSummary {
  id: WorkModeId;
  title: string;
  count: number;
  emptyState: string;
}

export interface WorkItemLink {
  id: string;
  title: string;
  taskType?: string;
  status?: string | null;
}

export interface TaskRelationshipHub {
  task: TaskDto;
  links: {
    hierarchy: {
      parent: WorkItemLink | null;
      children: WorkItemLink[];
    };
    dependencies: {
      blocks: string[];
      blockedBy: string[];
    };
    docs: WorkItemLink[];
    repo: WorkItemLink[];
    runs: WorkItemLink[];
    artifacts: WorkItemLink[];
    memory: WorkItemLink[];
    context: WorkItemLink[];
    comments: WorkItemLink[];
    automations: WorkItemLink[];
    audit: WorkItemLink[];
  };
  modes: WorkModeSummary[];
  trace: {
    projectId: string | null;
    entity: { kind: "work_item"; id: string };
    typedLinks: string[];
    audit: WorkItemLink[];
  };
}

export type WorkView = "board" | "list" | "table" | "calendar" | "gantt" | "report";

export interface ScopedWorkItems {
  view: WorkView;
  items: Array<{
    id: string;
    title: string;
    taskType: string;
    status: string | null;
    projectId: string | null;
    parentId: string | null;
    cycleId: string | null;
    moduleId: string | null;
  }>;
  trace: {
    scope: { projectId: string | null };
    entity: { kind: "work_view"; id: WorkView };
  };
}

function isoStamp(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : v;
}

export async function getTaskDetail(
  em: EntityManager,
  taskId: string,
  orgId: string,
): Promise<TaskDetailPayload | null> {
  const conn = sqlAccess(em);
  const rows = await conn.execute<TaskDetail[]>(
    `SELECT id, org_id, project_id, parent_id, title, description, status, priority, created_at, updated_at
       FROM tasks WHERE id = $1 AND org_id = $2`,
    [taskId, orgId],
  );
  if (rows.length === 0) return null;
  const raw = rows[0]!;
  const task: TaskDetail = {
    ...raw,
    created_at: isoStamp(raw.created_at as string | Date),
    updated_at: isoStamp(raw.updated_at as string | Date),
  };

  const subtasks = await conn.execute<SubtaskRow[]>(
    `SELECT id, title, status, priority FROM tasks
       WHERE parent_id = $1 ORDER BY priority DESC, created_at ASC, id ASC`,
    [taskId],
  );

  const edges = await conn.execute<EdgeRow[]>(
    `SELECT id, from_kind, from_id, to_kind, to_id, rel FROM edges
       WHERE (from_kind = 'task' AND from_id = $1)
          OR (to_kind = 'task' AND to_id = $1)
       ORDER BY created_at ASC, id ASC`,
    [taskId],
  );

  const eventRows = await conn.execute<(EventRow & { created_at: string | Date })[]>(
    `SELECT id, actor, subject_kind, subject_id, verb, payload, created_at
       FROM events WHERE subject_kind = 'task' AND subject_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
    [taskId],
  );
  const events = eventRows.map((e) => ({
    ...e,
    created_at: isoStamp(e.created_at),
  }));

  return { task, subtasks, edges, events };
}

export async function getTaskRelationshipHub(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskRelationshipHub> {
  const task = await getTask(em, ctx, taskId);
  const tasks = await listTasks(em, ctx, {});
  const parent = task.parentId ? tasks.find((item) => item.id === task.parentId) ?? null : null;
  const children = tasks.filter((item) => item.parentId === task.id);
  const audit: WorkItemLink[] = [];
  const links: TaskRelationshipHub["links"] = {
    hierarchy: {
      parent: parent ? taskLink(parent) : null,
      children: children.map(taskLink),
    },
    dependencies: {
      blocks: [...task.dependencies.blocks],
      blockedBy: [...task.dependencies.blocked_by],
    },
    docs: [],
    repo: [],
    runs: [],
    artifacts: [],
    memory: [],
    context: [],
    comments: [],
    automations: [],
    audit,
  };
  return {
    task,
    links,
    modes: modeSummaries(links),
    trace: {
      projectId: task.projectId,
      entity: { kind: "work_item", id: task.id },
      typedLinks: Object.keys(links),
      audit,
    },
  };
}

export async function listScopedWorkItems(
  em: EntityManager,
  ctx: AppContext,
  input: { view?: WorkView } = {},
): Promise<ScopedWorkItems> {
  const view = input.view ?? "list";
  const tasks = await listTasks(em, ctx, {});
  return {
    view,
    items: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      taskType: task.taskType,
      status: task.status,
      projectId: task.projectId,
      parentId: task.parentId,
      cycleId: task.cycleId,
      moduleId: task.moduleId,
    })),
    trace: {
      scope: { projectId: ctx.projectId ?? null },
      entity: { kind: "work_view", id: view },
    },
  };
}

export async function bulkUpdateStatus(
  em: EntityManager,
  ids: string[],
  status: TaskStatus,
  orgId: string,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  if (!TASK_STATUSES.includes(status)) {
    throw new Error(`bulkUpdateStatus: invalid status ${status}`);
  }
  const conn = sqlAccess(em);
  const placeholders = ids.map((_, i) => `$${i + 3}`).join(", ");
  const params: (string | number)[] = [status, orgId, ...ids];
  const result = await conn.execute<{ id: string }[]>(
    `UPDATE tasks SET status = $1, updated_at = now()
       WHERE org_id = $2 AND id IN (${placeholders})
       RETURNING id`,
    params,
  );
  for (const row of result) {
    await eventDispatcher.dispatch(em, {
      orgId,
      actor: "system",
      subjectKind: "task",
      subjectId: row.id,
      verb: "status_changed",
      payload: { to: status, bulk: true },
    });
  }
  return { updated: result.length };
}

export async function bulkDeleteTasks(
  em: EntityManager,
  ids: string[],
  orgId: string,
): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const conn = sqlAccess(em);
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
  const params: string[] = [orgId, ...ids];
  const result = await conn.execute<{ id: string; project_id: string | null }[]>(
    `DELETE FROM tasks WHERE org_id = $1 AND id IN (${placeholders})
       RETURNING id, project_id`,
    params,
  );
  for (const row of result) {
    await eventDispatcher.dispatch(em, {
      orgId,
      projectId: row.project_id,
      actor: "system",
      subjectKind: "task",
      subjectId: row.id,
      verb: "deleted",
      payload: { bulk: true },
    });
  }
  return { deleted: result.length };
}

function taskLink(task: TaskDto): WorkItemLink {
  return {
    id: task.id,
    title: task.title,
    taskType: task.taskType,
    status: task.status,
  };
}

function modeSummaries(links: TaskRelationshipHub["links"]): WorkModeSummary[] {
  return [
    { id: "planning", title: "Planning", count: links.hierarchy.children.length + links.dependencies.blocks.length + links.dependencies.blockedBy.length, emptyState: "No planning links yet." },
    { id: "docs", title: "Docs", count: links.docs.length, emptyState: "No docs linked yet." },
    { id: "repo-workspace", title: "Repo/Workspace", count: links.repo.length, emptyState: "No repo workspace linked yet." },
    { id: "agent-run", title: "Agent Run", count: links.runs.length, emptyState: "No agent runs linked yet." },
    { id: "knowledge", title: "Knowledge", count: links.memory.length + links.context.length, emptyState: "No knowledge links yet." },
    { id: "audit-activity", title: "Audit/Activity", count: links.audit.length, emptyState: "No audit activity yet." },
  ];
}
