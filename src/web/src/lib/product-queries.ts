import { Project } from "../../../db/entities/tasks/Project.ts";
import { Sprint } from "../../../db/entities/tasks/Sprint.ts";
import { Task } from "../../../db/entities/tasks/Task.ts";
import {
  listTasks as listApplicationTasks,
  type TaskDto,
} from "../../../application/tasks/queries.ts";
import { listDocs } from "../../../application/docs/queries.ts";
import { listRuns as listApplicationRuns } from "../../../application/runs/queries.ts";
import { listSprints as listApplicationSprints } from "../../../application/sprints/queries.ts";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

export interface ProjectListing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export interface DocumentListing {
  id: string;
  title: string;
  kind: string;
  updated_at: string;
}

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
  updated_at: string;
}

export interface RunListing {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface SprintListing {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  capacity: number | null;
  capacity_points: number | null;
  start_date: string | null;
  end_date: string | null;
  task_count: number;
  total_estimate: number;
  updated_at: string;
}

export interface BacklogTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  estimate_points: number | null;
  sprint_id: string | null;
  project_id: string | null;
  updated_at: string;
}

export interface VelocityPoint {
  sprint_id: string;
  name: string;
  points: number;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toBoardTask(task: TaskDto): BoardTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? "pending",
    priority: task.priority ?? 0,
    project_id: task.projectId,
    updated_at: isoStamp(task.updatedAt),
  };
}

function toBacklogTask(task: TaskDto): BacklogTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? "pending",
    priority: task.priority ?? 0,
    estimate_points: task.points,
    sprint_id: null,
    project_id: task.projectId,
    updated_at: isoStamp(task.updatedAt),
  };
}

export async function listProjects(): Promise<ProjectListing[]> {
  const em = await getEm();
  const projects = await em.find(Project, {}, { orderBy: { createdAt: "ASC", id: "ASC" } });
  return projects.map((project) => ({
    id: project.id,
    slug: project.id,
    name: project.name,
    description: null,
    updated_at: isoStamp(project.updatedAt),
  }));
}

export async function listDocuments(projectId?: string | null): Promise<DocumentListing[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const documents = await listDocs(em, { orgId, userId: null, projectId });
  return documents
    .filter((doc) => projectId === undefined || projectId === null || doc.projectId === projectId)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      kind: "document",
      updated_at: isoStamp(doc.updatedAt),
    }));
}

export async function listBoardTasks(projectId?: string | null): Promise<BoardTask[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const tasks = await listApplicationTasks(em, { orgId, userId: null, projectId }, {});
  return tasks
    .filter((task) => !projectId || task.projectId === projectId)
    .map(toBoardTask)
    .sort((a, b) => b.priority - a.priority || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
}

export async function listRuns(projectId?: string | null): Promise<RunListing[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const runs = await listApplicationRuns(em, { orgId, userId: null, projectId });
  return runs
    .map((run) => ({
      id: run.id,
      agent: run.agentName ?? "",
      model: null,
      status: run.status ?? "",
      started_at: isoStamp(run.createdAt),
      ended_at: null,
    }));
}

export async function listSprintsForProject(projectId: string): Promise<SprintListing[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const sprints = await listApplicationSprints(em, { orgId, userId: null, projectId });
  const tasks = await em.find(Task, { org: orgId, projectId } as never);
  return sprints.map((sprint) => ({
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    capacity: sprint.capacityPoints,
    capacity_points: sprint.capacityPoints,
    start_date: sprint.startDate ? isoStamp(sprint.startDate) : null,
    end_date: sprint.endDate ? isoStamp(sprint.endDate) : null,
    task_count: tasks.filter((task) => task.sprint === sprint.id).length,
    total_estimate: tasks
      .filter((task) => task.sprint === sprint.id)
      .reduce((sum, task) => sum + (task.points ?? 0), 0),
    updated_at: isoStamp(sprint.endDate),
  }));
}

export const listSprints = listSprintsForProject;

export async function getSprintVelocity(projectId: string): Promise<VelocityPoint[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const [sprints, tasks] = await Promise.all([
    em.find(Sprint, { org: orgId, projectId, status: "completed" } as never, { orderBy: { closedAt: "ASC", updatedAt: "ASC", id: "ASC" } }),
    em.find(Task, { org: orgId, projectId, status: "completed" } as never),
  ]);
  return sprints.map((sprint) => ({
    sprint_id: sprint.id,
    name: sprint.name,
    points: tasks
      .filter((task) => task.sprint === sprint.id)
      .reduce((sum, task) => sum + (task.points ?? 0), 0),
  }));
}

export async function listBacklog(projectId: string): Promise<BacklogTask[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const tasks = await listApplicationTasks(em, { orgId, userId: null, projectId }, {});
  return tasks
    .filter((task) => task.projectId === projectId && !["completed", "cancelled"].includes(task.status ?? ""))
    .map(toBacklogTask);
}

export async function listSprintTasksForBacklog(sprintId: string): Promise<BacklogTask[]> {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const tasks = await em.find(Task, { org: orgId, sprint: sprintId } as never, {
    orderBy: { priority: "DESC", updatedAt: "DESC", id: "ASC" },
  });
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status ?? "pending",
    priority: task.priority ?? 0,
    estimate_points: task.points ?? null,
    sprint_id: task.sprint ?? null,
    project_id: task.projectId,
    updated_at: isoStamp(task.updatedAt),
  }));
}

export function groupTasksByStatus(tasks: readonly BoardTask[]): Record<string, BoardTask[]> {
  const groups: Record<string, BoardTask[]> = {
    pending: [],
    in_progress: [],
    blocked: [],
    completed: [],
    cancelled: [],
  };
  for (const task of tasks) {
    const bucket = groups[task.status] ?? (groups[task.status] = []);
    bucket.push(task);
  }
  return groups;
}
