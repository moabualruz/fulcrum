import type { RequestEvent } from "@sveltejs/kit";
import { createCredentialApiCaller } from "@platform-core/interface/http/credential-api-client";
import { activeOrgId, activeUserId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type SettingsApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createSettingsApiForEvent(event: SettingsApiEvent) {
  return createCredentialApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
