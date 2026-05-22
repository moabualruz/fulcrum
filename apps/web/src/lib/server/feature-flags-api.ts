import type { RequestEvent } from "@sveltejs/kit";
import { createFeatureExperimentApiCaller } from "@feature-flags/interface/http/feature-experiment-api-client";
import { activeOrgId, activeUserId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

type FeatureFlagsApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export function createFeatureFlagsApiForEvent(event: FeatureFlagsApiEvent) {
  return createFeatureExperimentApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}
