import type { RequestEvent } from "@sveltejs/kit";
import {
  createProjectTimelineApiCaller,
  ProjectTimelineApiError,
} from "@work-management/interface/http/project-timeline-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type ProjectTimelineApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export { ProjectTimelineApiError } from "@work-management/interface/http/project-timeline-api-client";

export function createProjectTimelineApiForEvent(event: ProjectTimelineApiEvent) {
  return createProjectTimelineApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
