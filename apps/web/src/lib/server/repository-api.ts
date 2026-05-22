import type { RequestEvent } from "@sveltejs/kit";
import { createRepositoryApiCaller } from "@integration-hub/interface/http/repository-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type RepositoryApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createRepositoryApiForEvent(event: RepositoryApiEvent) {
  return createRepositoryApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
