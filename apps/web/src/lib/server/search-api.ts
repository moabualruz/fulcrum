import type { RequestEvent } from "@sveltejs/kit";
import { createSearchApiCaller } from "@knowledge-workspace/interface/http/search-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

const DEFAULT_USER_ID = "local";
const DEFAULT_SEARCH_API_TOKEN = "web-local";

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
