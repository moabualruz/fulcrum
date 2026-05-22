import type { RequestEvent } from "@sveltejs/kit";
import { createPlanningStructureApiCaller } from "@work-management/interface/http/planning-structure-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type PlanningStructureApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export { PlanningStructureApiError } from "@work-management/interface/http/planning-structure-api-client";

export function createPlanningStructureApiForEvent(event: PlanningStructureApiEvent) {
  return createPlanningStructureApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
