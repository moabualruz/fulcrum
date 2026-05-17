import type { RequestEvent } from "@sveltejs/kit";
import { createCustomFieldApiCaller } from "@work-management/interface/http/custom-field-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

const DEFAULT_USER_ID = "local";

type CustomFieldApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createCustomFieldApiForEvent(event: CustomFieldApiEvent) {
  return createCustomFieldApiCaller({
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
