import { error, type RequestEvent } from "@sveltejs/kit";
import {
  createProjectApiCaller,
  ProjectApiError,
} from "@work-management/interface/http/project-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type ProjectApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;
type ProjectListResponse = { data?: PublicProject[] } | PublicProject[];

interface PublicProject {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  taskCount?: number | string | null;
  task_count?: number | string | null;
  openTaskCount?: number | string | null;
  open_task_count?: number | string | null;
  docCount?: number | string | null;
  doc_count?: number | string | null;
  latestActivityAt?: string | null;
  latest_activity_at?: string | null;
}

export { activeOrgId } from "$lib/server/public-api";

export function createProjectApiForEvent(event: ProjectApiEvent) {
  return createProjectApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}

export async function ensureProjectExists(event: ProjectApiEvent, projectId: string): Promise<void> {
  const projectApi = createProjectApiForEvent(event);

  try {
    await projectApi.projects.get({ id: projectId });
  } catch (cause) {
    if (cause instanceof ProjectApiError && cause.status === 404) {
      throw error(404, "Project not found");
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw error(502, message);
  }
}

export function currentUserId(locals: App.Locals): string | null {
  return locals.userId ?? null;
}

export async function listProjectRowsForEvent(event: ProjectApiEvent) {
  const response = await createProjectApiForEvent(event).projects.list() as ProjectListResponse;
  const projects = Array.isArray(response) ? response : response.data ?? [];
  return projects.map(toProjectRow);
}

export interface ProjectOption {
  id: string;
  name: string;
}

/** Candidate parent projects for the new-project parent picker. */
export async function listProjectOptionsForEvent(event: ProjectApiEvent): Promise<ProjectOption[]> {
  const response = await createProjectApiForEvent(event).projects.options();
  return (Array.isArray(response) ? response : []) as ProjectOption[];
}

interface ProjectSetupFields {
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  repoPath: string | null;
  template: string | null;
  parentId: string | null;
}

interface ProjectSetupResult {
  links: { project: { id: string; slug: string } };
}

interface ProjectCreateResult {
  id: string;
  slug: string;
}

/** Plain project create — no template, repo, or parent hierarchy. */
export async function createProjectForEvent(
  event: ProjectApiEvent,
  fields: { slug: string; name: string; description: string | null; kind: string },
): Promise<ProjectCreateResult> {
  return await createProjectApiForEvent(event).projects.create(fields) as ProjectCreateResult;
}

/** Project create with template/repo/parent setup; returns the setup links. */
export async function createProjectFromSetupForEvent(
  event: ProjectApiEvent,
  fields: ProjectSetupFields,
): Promise<ProjectSetupResult> {
  return await createProjectApiForEvent(event).projects.createFromSetup(fields) as ProjectSetupResult;
}

interface BacklogSprint {
  id: string;
  name: string;
  status: string;
  capacity_points: number | null;
}

interface BacklogTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  estimate_points: number | null;
  sprint_id: string | null;
}

export interface ProjectBacklog {
  project: { id: string; name: string };
  sprints: BacklogSprint[];
  backlogTasks: BacklogTask[];
}

/** The project backlog read-model: sprints plus unassigned open tasks. */
export async function loadProjectBacklogForEvent(
  event: ProjectApiEvent,
  projectId: string,
): Promise<ProjectBacklog> {
  return await createProjectApiForEvent(event).backlog.load({ projectId }) as ProjectBacklog;
}

export async function addBacklogTaskToSprintForEvent(
  event: ProjectApiEvent,
  input: { projectId: string; sprintId: string; taskId: string },
): Promise<void> {
  await createProjectApiForEvent(event).backlog.addTask(input);
}

export async function removeBacklogTaskFromSprintForEvent(
  event: ProjectApiEvent,
  input: { projectId: string; sprintId: string; taskId: string },
): Promise<void> {
  await createProjectApiForEvent(event).backlog.removeTask(input);
}

function toProjectRow(project: PublicProject) {
  const updatedAt = project.updated_at ?? project.updatedAt ?? "";
  return {
    id: project.id,
    slug: project.slug ?? project.id,
    name: project.name,
    description: project.description ?? null,
    updated_at: updatedAt,
    task_count: numeric(project.task_count ?? project.taskCount),
    open_task_count: numeric(project.open_task_count ?? project.openTaskCount),
    doc_count: numeric(project.doc_count ?? project.docCount),
    latest_activity_at: project.latest_activity_at ?? project.latestActivityAt ?? updatedAt,
  };
}

function numeric(value: number | string | null | undefined): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}
