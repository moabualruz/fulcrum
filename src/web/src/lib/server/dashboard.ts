import type { EntityManager } from "@mikro-orm/postgresql";

import { Project } from "../../../../db/entities/tasks/Project.ts";
import { listDocs } from "../../../../application/docs/queries.ts";
import { listRuns } from "../../../../application/runs/queries.ts";
import { listTasks } from "../../../../application/tasks/queries.ts";

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

function isoStamp(value: Date): string {
  return value.toISOString();
}

export async function loadDashboard(
  em: EntityManager,
  orgId: string,
  projectId?: string | null,
): Promise<DashboardData> {
  const ctx = { orgId, userId: null, projectId };
  const [projects, docs, runs, tasks] = await Promise.all([
    em.find(Project, { org: orgId } as never, { orderBy: { createdAt: "ASC", id: "ASC" } }),
    listDocs(em, ctx),
    listRuns(em, ctx),
    listTasks(em, ctx, {}),
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
