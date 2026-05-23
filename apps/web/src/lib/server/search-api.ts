import type { RequestEvent } from "@sveltejs/kit";
import { createSearchApiCaller } from "@knowledge-workspace/interface/http/search-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

const DEFAULT_USER_ID = "local";
// Server treats the bearer token as the active org id. Default to the canonical
// local org so manual / dev sessions land in the same org as seeded data.
// Override with FULCRUM_API_TOKEN for prod.
const DEFAULT_SEARCH_API_TOKEN = "00000000-0000-0000-0000-000000000001";

type SearchApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createSearchApiForEvent(event: SearchApiEvent) {
  const headers = cookieHeaders(event.request);
  return createSearchApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    token: activeSearchToken(),
    fetch: event.fetch,
    headers,
  });
}

function activeUserId(locals: App.Locals): string {
  const userId = locals.userId;
  return userId && userId.trim() ? userId : DEFAULT_USER_ID;
}

function activeSearchToken(): string {
  return process.env["FULCRUM_API_TOKEN"] ?? process.env["FULCRUM_PUBLIC_API_TOKEN"] ?? DEFAULT_SEARCH_API_TOKEN;
}
