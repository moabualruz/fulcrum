import type { RequestEvent } from "@sveltejs/kit";
import { createProjectStatusApiCaller } from "@work-management/interface/http/project-status-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type ProjectStatusApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createProjectStatusApiForEvent(event: ProjectStatusApiEvent) {
  return createProjectStatusApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
