import type { PageServerLoad, Actions } from "./$types";
import { createAuditApiClient } from "@workflow-coordination/interface/http/audit-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

interface RetentionPolicyEvent {
  locals: { orgId?: string | null };
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface RetentionPolicyResponse {
  retainDays?: unknown;
  retain_days?: unknown;
}

function createRetentionPolicyApi(event: RetentionPolicyEvent) {
  return createAuditApiClient({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals as App.Locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request as Request),
  });
}

function retainDaysOf(policy: RetentionPolicyResponse | null | undefined, fallback = 0): number {
  const value = policy?.retainDays ?? policy?.retain_days ?? fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const load: PageServerLoad = async (event) => {
  try {
    const publicPolicy = await createRetentionPolicyApi(event as RetentionPolicyEvent).retentionPolicy.get();
    return {
      retainDays: retainDaysOf(publicPolicy),
      saved: false,
    };
  } catch {
    return { retainDays: 0, saved: false };
  }
};

export const actions: Actions = {
  retention: async (event) => {
    const { request } = event;
    const formData = await request.formData();
    const retainDays = parseInt(formData.get("retain_days")?.toString() ?? "0", 10);
    const sanitizedRetainDays = isNaN(retainDays) ? 0 : retainDays;
    const publicPolicy = await createRetentionPolicyApi(event as RetentionPolicyEvent).retentionPolicy.set({
      retainDays: sanitizedRetainDays,
    });
    return { retainDays: retainDaysOf(publicPolicy, sanitizedRetainDays), saved: true };
  },
};
