import type { RequestEvent } from "@sveltejs/kit";
import { createConnectorApiCaller } from "@integration-hub/interface/http/connector-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type ConnectorApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createConnectorApiForEvent(event: ConnectorApiEvent) {
  return createConnectorApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
