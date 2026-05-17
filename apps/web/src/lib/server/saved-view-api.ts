import type { RequestEvent } from "@sveltejs/kit";
import { createSavedViewApiCaller } from "@work-management/interface/http/saved-view-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type SavedViewApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createSavedViewApiForEvent(event: SavedViewApiEvent) {
  return createSavedViewApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
