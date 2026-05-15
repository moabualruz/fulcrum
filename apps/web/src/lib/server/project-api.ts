import { error, type RequestEvent } from "@sveltejs/kit";
import {
  createProjectApiCaller,
  ProjectApiError,
} from "@work-management/interface/http/project-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type ProjectApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

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
