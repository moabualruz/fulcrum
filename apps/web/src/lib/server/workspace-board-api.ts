import type { RequestEvent } from "@sveltejs/kit";
import { createTaskApiCaller } from "@work-management/interface/http/task-api-client";
import { activeOrgId, activeUserId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type WorkspaceBoardApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createWorkspaceBoardApiForEvent(event: WorkspaceBoardApiEvent) {
  return createTaskApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
