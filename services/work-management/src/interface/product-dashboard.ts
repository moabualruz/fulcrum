import type {
  BacklogTask,
  BoardTask,
  DocumentListing,
  ProjectListing,
  RunListing,
  SprintListing,
  VelocityPoint,
} from "@work-management/application/dashboard/product-queries.ts";

export type {
  BacklogTask,
  BoardTask,
  DocumentListing,
  ProjectListing,
  RunListing,
  SprintListing,
  VelocityPoint,
};

export async function listProjects(): Promise<ProjectListing[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listProjects();
}

export async function listDocuments(projectId?: string | null): Promise<DocumentListing[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listDocuments(projectId);
}

export async function listBoardTasks(projectId?: string | null): Promise<BoardTask[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listBoardTasks(projectId);
}

export async function listRuns(projectId?: string | null): Promise<RunListing[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listRuns(projectId);
}

export async function listSprintsForProject(projectId: string): Promise<SprintListing[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listSprintsForProject(projectId);
}

export const listSprints = listSprintsForProject;

export async function getSprintVelocity(projectId: string): Promise<VelocityPoint[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.getSprintVelocity(projectId);
}

export async function listBacklog(projectId: string): Promise<BacklogTask[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listBacklog(projectId);
}

export const listBacklogTasks = listBacklog;

export async function listSprintTasksForBacklog(sprintId: string): Promise<BacklogTask[]> {
  const queries = await import("@work-management/application/dashboard/product-queries.ts");
  return queries.listSprintTasksForBacklog(sprintId);
}

export const listSprintTasks = listSprintTasksForBacklog;

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
