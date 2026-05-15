import type { PageServerLoad, Actions } from "./$types";

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

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function publicApiBaseUrl(url: URL, env: Record<string, string | undefined> = process.env): string {
  const raw = env["FULCRUM_SERVER_URL"] ?? env["FULCRUM_PUBLIC_API_URL"];
  return (raw ?? `${url.protocol}//${url.host}`).replace(/\/+$/, "");
}

function publicRetentionPolicyUrl(event: RetentionPolicyEvent): string {
  const base = publicApiBaseUrl(event.url);
  const url = new URL("/api/v1/audit/retention-policy", base);
  url.searchParams.set("orgId", event.locals.orgId || DEFAULT_ORG_ID);
  return url.toString();
}

function extractMessage(body: unknown): string {
  const error = (body as { error?: { json?: { message?: string }; message?: string } })?.error;
  return error?.json?.message ?? error?.message ?? "Retention policy request failed.";
}

async function publicRetentionPolicyRequest(
  event: RetentionPolicyEvent,
  method: "GET" | "PATCH",
  retainDays?: number,
): Promise<RetentionPolicyResponse | null> {
  const target = publicRetentionPolicyUrl(event);
  const response = await event.fetch(target, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
    body: method === "PATCH" ? JSON.stringify({ retainDays }) : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractMessage(body));
  return body as RetentionPolicyResponse | null;
}

function retainDaysOf(policy: RetentionPolicyResponse | null | undefined, fallback = 0): number {
  const value = policy?.retainDays ?? policy?.retain_days ?? fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const load: PageServerLoad = async (event) => {
  const publicPolicy = await publicRetentionPolicyRequest(event as RetentionPolicyEvent, "GET");
  return {
    retainDays: retainDaysOf(publicPolicy),
    saved: false,
  };
};

export const actions: Actions = {
  retention: async (event) => {
    const { request } = event;
    const formData = await request.formData();
    const retainDays = parseInt(formData.get("retain_days")?.toString() ?? "0", 10);
    const sanitizedRetainDays = isNaN(retainDays) ? 0 : retainDays;
    const publicPolicy = await publicRetentionPolicyRequest(event as RetentionPolicyEvent, "PATCH", sanitizedRetainDays);
    return { retainDays: retainDaysOf(publicPolicy, sanitizedRetainDays), saved: true };
  },
};
