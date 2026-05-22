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
