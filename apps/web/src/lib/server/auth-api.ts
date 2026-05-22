import type { RequestEvent } from "@sveltejs/kit";
import { createAuthApiCaller } from "@identity-access/interface/http/auth-api-client";
import { activeOrgId, activeUserId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type AuthApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createAuthApiForEvent(event: AuthApiEvent) {
  return createAuthApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
