import type { EntityManager } from "@mikro-orm/postgresql";
import type { SqlExecutor } from "../../db/sql.ts";

import { Project } from "../../db/entities/tasks/Project.ts";
import { listDocs } from "../docs/queries.ts";
import { listRuns } from "../runs/queries.ts";
import { listTasks } from "../tasks/queries.ts";

export interface ProjectTile {
  id: string;
  name: string;
  openTasks: number;
  lastActivity: string | null;
}

export interface DashboardData {
  counters: { projects: number; openTasks: number; docs: number; runsLast7d: number };
  recentRuns: Array<{ id: string; agent: string; status: string; started_at: string; ended_at: string | null }>;
  recentDocs: Array<{ id: string; title: string; kind: string; updated_at: string }>;
  topTasks: Array<{ id: string; title: string; status: string; priority: number; project_id: string | null }>;
  projectTiles: ProjectTile[];
  unreadCount: number;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function loadDashboard(
  em: EntityManager | SqlExecutor,
  orgId: string,
  projectId?: string | null,
): Promise<DashboardData> {
  if (!("find" in em)) {
    return loadDashboardFromSql(em, orgId, projectId);
  }
  const manager = em as EntityManager;
  const ctx = { orgId, userId: null, projectId };
  const [projects, docs, runs, tasks] = await Promise.all([
    manager.find(Project, { org: orgId } as never, { orderBy: { createdAt: "ASC", id: "ASC" } }),
    listDocs(manager, ctx),
    listRuns(manager, ctx),
    listTasks(manager, ctx, {}),
  ]);

  const visibleTasks = projectId === undefined
    ? tasks
    : tasks.filter((task) => task.projectId === projectId);
  const visibleDocs = projectId === undefined
    ? docs
    : docs.filter((doc) => doc.projectId === projectId);

  const openTasks = visibleTasks.filter((task) => !["completed", "cancelled"].includes(task.status ?? ""));
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const runsLast7d = runs.filter((run) => run.createdAt.getTime() >= sevenDaysAgo).length;

  return {
    counters: {
      projects: projects.length,
      openTasks: openTasks.length,
      docs: visibleDocs.length,
      runsLast7d,
    },
    recentRuns: runs.slice(0, 5).map((run) => ({
      id: run.id,
      agent: run.agentName ?? "",
      status: run.status ?? "",
      started_at: isoStamp(run.createdAt),
      ended_at: null,
    })),
    recentDocs: visibleDocs.slice(0, 5).map((doc) => ({
      id: doc.id,
      title: doc.title,
      kind: "document",
      updated_at: isoStamp(doc.updatedAt),
    })),
    topTasks: openTasks
      .slice()
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status ?? "",
        priority: task.priority ?? 0,
        project_id: task.projectId,
      })),
    projectTiles: projects.map((project) => ({
      id: project.id,
      name: project.name,
      openTasks: openTasks.filter((task) => task.projectId === project.id).length,
      lastActivity: null,
    })),
    unreadCount: 0,
  };
}

async function loadDashboardFromSql(
  db: SqlExecutor,
  orgId: string,
  projectId?: string | null,
): Promise<DashboardData> {
  const projectWhere = projectId === undefined ? "" : projectId === null ? " AND project_id IS NULL" : " AND project_id = $2";
  const projectParams = projectId === undefined || projectId === null ? [orgId] : [orgId, projectId];
  const [projects, docs, runs, tasks, unread] = await Promise.all([
    db.query<{ id: string; name: string }>(
      `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY created_at ASC, id ASC`,
      [orgId],
    ),
    db.query<{ id: string; title: string; kind: string; updated_at: string }>(
      `SELECT id, title, kind, updated_at FROM documents WHERE org_id = $1${projectWhere} ORDER BY updated_at DESC, id ASC`,
      projectParams,
    ),
    db.query<{ id: string; agent: string | null; status: string | null; started_at: string; ended_at: string | null }>(
      `SELECT id, agent, status, started_at, ended_at FROM agent_runs WHERE org_id = $1${projectWhere} ORDER BY started_at DESC, id ASC`,
      projectParams,
    ),
    db.query<{ id: string; title: string; status: string | null; priority: number | null; project_id: string | null; updated_at: string }>(
      `SELECT id, title, status, priority, project_id, updated_at FROM tasks WHERE org_id = $1${projectWhere} ORDER BY updated_at DESC, id ASC`,
      projectParams,
    ),
    db.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM events WHERE org_id = $1 AND created_at >= $2`,
      [orgId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()],
    ),
  ]);

  const openTasks = tasks.filter((task) => !["completed", "cancelled"].includes(task.status ?? ""));
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const runsLast7d = runs.filter((run) => new Date(run.started_at).getTime() >= sevenDaysAgo).length;

  return {
    counters: {
      projects: projects.length,
      openTasks: openTasks.length,
      docs: docs.length,
      runsLast7d,
    },
    recentRuns: runs.slice(0, 5).map((run) => ({
      id: run.id,
      agent: run.agent ?? "",
      status: run.status ?? "",
      started_at: isoStamp(run.started_at),
      ended_at: run.ended_at ? isoStamp(run.ended_at) : null,
    })),
    recentDocs: docs.slice(0, 5).map((doc) => ({
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
      updated_at: isoStamp(doc.updated_at),
    })),
    topTasks: openTasks
      .slice()
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || isoStamp(b.updated_at).localeCompare(isoStamp(a.updated_at)))
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status ?? "",
        priority: task.priority ?? 0,
        project_id: task.project_id,
      })),
    projectTiles: projects.map((project) => ({
      id: project.id,
      name: project.name,
      openTasks: tasks.filter((task) => task.project_id === project.id && !["completed", "cancelled"].includes(task.status ?? "")).length,
      lastActivity: null,
    })),
    unreadCount: Number(unread[0]?.count ?? 0),
  };
}
