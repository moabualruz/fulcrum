import type { RequestEvent } from "@sveltejs/kit";
import { createTaskApiCaller } from "@work-management/interface/http/task-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type TaskApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createTaskApiForEvent(event: TaskApiEvent) {
  return createTaskApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: event.locals.userId ?? "local",
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
