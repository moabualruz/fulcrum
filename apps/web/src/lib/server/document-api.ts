import type { RequestEvent } from "@sveltejs/kit";
import { createDocumentApiCaller } from "@knowledge-workspace/interface/http/document-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type DocumentApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createDocumentApiForEvent(event: DocumentApiEvent) {
  return createDocumentApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
