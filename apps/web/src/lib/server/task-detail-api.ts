import type { RequestEvent } from "@sveltejs/kit";
import { createTaskApiCaller } from "@work-management/interface/http/task-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

const DEFAULT_USER_ID = "local";

type TaskDetailApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createTaskDetailApiForEvent(event: TaskDetailApiEvent) {
  return createTaskApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}

function activeUserId(locals: App.Locals): string {
  const userId = locals.userId;
  return userId && userId.trim() ? userId : DEFAULT_USER_ID;
}
