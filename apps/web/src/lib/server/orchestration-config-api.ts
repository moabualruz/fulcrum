import type { RequestEvent } from "@sveltejs/kit";
import { createAgentRunApiCaller } from "@execution-orchestration/interface/http/agent-run-api-client";
import { createWorkflowSettingsApiCaller } from "@work-management/interface/http/workflow-settings-api-client";
import { activeOrgId, activeUserId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type OrchestrationApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createOrchestrationConfigApiForEvent(event: OrchestrationApiEvent) {
  const baseUrl = publicApiBaseUrl(event.url);
  const orgId = activeOrgId(event.locals);
  const headers = cookieHeaders(event.request);
  const settings = createWorkflowSettingsApiCaller({
    baseUrl,
    orgId,
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers,
  });
  const agentRuns = createAgentRunApiCaller({
    baseUrl,
    orgId,
    fetch: event.fetch,
    headers,
  });

  return {
    orchestration: settings.orchestration,
    workflows: settings.workflows,
    runs: agentRuns.runs,
  };
}
