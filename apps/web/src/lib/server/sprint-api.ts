import type { RequestEvent } from "@sveltejs/kit";
import { createSprintApiCaller } from "@work-management/interface/http/sprint-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type SprintApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

/**
 * Web-side wrapper over the sprint public API client. The `/projects/[id]/sprints`
 * and `/sprint/[sprintId]` routes call this so the web surface stays a pure
 * invocation layer with no database access.
 */
export function createSprintApiForEvent(event: SprintApiEvent) {
  return createSprintApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
