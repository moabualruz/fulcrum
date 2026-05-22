import type { RequestEvent } from "@sveltejs/kit";
import { createReportApiCaller } from "@work-management/interface/http/report-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type ReportApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createReportApiForEvent(event: ReportApiEvent) {
  return createReportApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
