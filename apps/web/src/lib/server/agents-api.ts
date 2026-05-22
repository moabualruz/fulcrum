import type { RequestEvent } from "@sveltejs/kit";
import { createAgentProfileApiCaller } from "@execution-orchestration/interface/http/agent-profile-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type AgentsApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createAgentsApiForEvent(event: AgentsApiEvent) {
  return createAgentProfileApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}

function activeUserId(locals: App.Locals): string | null {
  const userId = (locals as App.Locals & { userId?: string | null }).userId;
  return userId && userId.trim() ? userId : null;
}
