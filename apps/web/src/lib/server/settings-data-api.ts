import type { RequestEvent } from "@sveltejs/kit";
import { createDataPortabilityApiCaller } from "@integration-hub/interface/http/data-portability-api-client";
import { activeOrgId, activeUserId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type SettingsDataApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createSettingsDataApiForEvent(event: SettingsDataApiEvent) {
  return createDataPortabilityApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
