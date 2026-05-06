/**
 * Dashboard — migrated from raw ProductDb to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";

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

interface CountRow { c: string | number }

function toNumber(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.parseInt(v, 10);
  return 0;
}

type SqlValue = string | number | boolean | null;
type QueryableDb = {
  query: <T>(sql: string, params?: SqlValue[]) => Promise<T>;
};

function projectClause(
  projectId: string | null | undefined,
  paramIndex: number,
): { sql: string; param: SqlValue | undefined } {
  if (projectId === undefined) return { sql: "", param: undefined };
  if (projectId === null) return { sql: " AND project_id IS NULL", param: undefined };
  return { sql: ` AND project_id = $${paramIndex}`, param: projectId };
}

export async function loadDashboard(
  em: EntityManager | QueryableDb,
  orgId: string,
  projectId?: string | null,
): Promise<DashboardData> {
  const scope = projectClause(projectId, 2);
  const params: SqlValue[] = [orgId];
  if (scope.param !== undefined) params.push(scope.param);
  const NOT_DONE = "status NOT IN ('completed','cancelled')";
  const RECENT_LIMIT = 5;

  interface TileRow { id: string; name: string; open_tasks: string | number; last_activity: string | Date | null }

  const conn = queryConnection(em);
  const [projectsR, openTasksR, docsR, runsR, recentRuns, recentDocs, topTasks, tileRows, unreadR] = await Promise.all([
    conn.execute<CountRow[]>(`SELECT count(*)::text AS c FROM projects WHERE org_id = $1`, [orgId]),
    conn.execute<CountRow[]>(
      `SELECT count(*)::text AS c FROM tasks WHERE org_id = $1 AND ${NOT_DONE}${scope.sql}`,
      params,
    ),
    conn.execute<CountRow[]>(
      `SELECT count(*)::text AS c FROM documents WHERE org_id = $1${scope.sql}`,
      params,
    ),
    conn.execute<CountRow[]>(
      `SELECT count(*)::text AS c FROM agent_runs
         WHERE org_id = $1 AND started_at >= now() - interval '7 days'${scope.sql}`,
      params,
    ),
    conn.execute<DashboardData["recentRuns"][number][]>(
      `SELECT id, agent, status, started_at, ended_at FROM agent_runs
         WHERE org_id = $1${scope.sql} ORDER BY started_at DESC LIMIT ${RECENT_LIMIT}`,
      params,
    ),
    conn.execute<DashboardData["recentDocs"][number][]>(
      `SELECT id, title, kind, updated_at FROM documents
         WHERE org_id = $1${scope.sql} ORDER BY updated_at DESC LIMIT ${RECENT_LIMIT}`,
      params,
    ),
    conn.execute<DashboardData["topTasks"][number][]>(
      `SELECT id, title, status, priority, project_id FROM tasks
         WHERE org_id = $1 AND ${NOT_DONE}${scope.sql}
         ORDER BY priority DESC, updated_at DESC LIMIT ${RECENT_LIMIT}`,
      params,
    ),
    conn.execute<TileRow[]>(
      `SELECT p.id, p.name,
              coalesce((SELECT count(*)::text FROM tasks t
                        WHERE t.project_id = p.id AND t.org_id = $1
                          AND t.status NOT IN ('completed','cancelled')), '0') AS open_tasks,
              (SELECT max(e.created_at) FROM events e
               WHERE e.project_id = p.id AND e.org_id = $1) AS last_activity
         FROM projects p WHERE p.org_id = $1
         ORDER BY p.created_at ASC, p.id ASC`,
      [orgId],
    ),
    conn.execute<CountRow[]>(
      `SELECT count(*)::text AS c FROM events
         WHERE org_id = $1 AND created_at >= now() - interval '24 hours'`,
      [orgId],
    ),
  ]);

  return {
    counters: {
      projects: toNumber(projectsR[0]?.c),
      openTasks: toNumber(openTasksR[0]?.c),
      docs: toNumber(docsR[0]?.c),
      runsLast7d: toNumber(runsR[0]?.c),
    },
    recentRuns,
    recentDocs,
    topTasks,
    projectTiles: tileRows.map((r) => ({
      id: r.id,
      name: r.name,
      openTasks: toNumber(r.open_tasks),
      lastActivity: r.last_activity
        ? (r.last_activity instanceof Date ? r.last_activity.toISOString() : String(r.last_activity))
        : null,
    })),
    unreadCount: toNumber(unreadR[0]?.c),
  };
}

function queryConnection(em: EntityManager | QueryableDb): {
  execute: <T>(sql: string, params?: SqlValue[]) => Promise<T>;
} {
  if ("getConnection" in em && typeof em.getConnection === "function") {
    return em.getConnection() as {
      execute: <T>(sql: string, params?: SqlValue[]) => Promise<T>;
    };
  }

  return {
    execute: <T>(sql: string, params: SqlValue[] = []) => (em as QueryableDb).query<T>(sql, params),
  };
}
