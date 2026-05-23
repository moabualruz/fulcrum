import type { RequestEvent } from "@sveltejs/kit";
import { createSkillSupplyApiCaller } from "@platform-core/interface/http/skill-supply-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type SkillSupplyApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createSkillSupplyApiForEvent(event: SkillSupplyApiEvent) {
  return createSkillSupplyApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
