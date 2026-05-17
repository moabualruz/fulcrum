interface RepositorySyncEvent {
  locals: App.Locals;
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function queueRepositorySync(event: RepositorySyncEvent, repoId: string): Promise<void> {
  const orgId = activeOrgId(event.locals);
  const target = repositorySyncUrl(event.url, repoId, orgId);
  const response = await event.fetch(target, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
  const body = await readBody(response);
  if (!response.ok) throw new Error(extractApiError(body, response.status));
}

function repositorySyncUrl(currentUrl: URL, repoId: string, orgId: string): string {
  const base = publicApiBaseUrl() ?? `${currentUrl.protocol}//${currentUrl.host}`;
  const url = new URL(`/api/v1/repos/${encodeURIComponent(repoId)}/sync`, base);
  url.searchParams.set("orgId", orgId);
  return url.toString();
}

function activeOrgId(locals: App.Locals): string {
  const localOrgId = locals?.orgId;
  return localOrgId && localOrgId.trim() ? localOrgId : DEFAULT_ORG_ID;
}

function publicApiBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env["FULCRUM_SERVER_URL"] ?? env["FULCRUM_PUBLIC_API_URL"];
  return raw ? raw.replace(/\/+$/, "") : null;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractApiError(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) return body;
  const record = body as { error?: { message?: string } | string; message?: string } | null;
  if (typeof record?.error === "string") return record.error;
  return record?.error?.message ?? record?.message ?? `Repository sync request failed with ${status}.`;
}
