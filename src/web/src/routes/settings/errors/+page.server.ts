import { error, fail, redirect } from "@sveltejs/kit";

interface RouteLocals {
  session: unknown;
}

interface LoadEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface ActionEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: {
    formData(): Promise<FormData>;
    headers: { get(name: string): string | null };
  };
  url: URL;
}

export interface ErrorLogRow {
  id: string;
  occurredAt: string | Date;
  errorMessage: string;
  recentCliCommand?: string | null;
  recentTrpcProcedure?: string | null;
  os?: string | null;
  arch?: string | null;
  bunVersion?: string | null;
  fulcrumVersion?: string | null;
  stackTrace?: string | null;
  context: Record<string, unknown>;
}

function getBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function extractTrpcError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  const errorBody = (body as { error?: unknown }).error;
  if (typeof errorBody === "string") return errorBody;
  if (errorBody && typeof errorBody === "object") {
    const errorRecord = errorBody as Record<string, unknown>;
    if (typeof errorRecord["message"] === "string") return errorRecord["message"];
    const json = errorRecord["json"] as Record<string, unknown> | undefined;
    if (json && typeof json["message"] === "string") return json["message"];
  }
  return "Request failed";
}

function unwrapTrpcData(body: unknown): unknown {
  return (
    (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
    (body as { result?: { data?: unknown } })?.result?.data ??
    body
  );
}

async function callTrpcQuery(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  input: unknown,
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  try {
    const encoded = encodeURIComponent(JSON.stringify(input));
    const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}?input=${encoded}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: extractTrpcError(body), status: response.status };
    return { ok: true, data: unwrapTrpcData(body) };
  } catch (cause) {
    return { ok: false, error: String(cause), status: 500 };
  }
}

async function callTrpcMutation(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  input: unknown,
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({ json: input }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: extractTrpcError(body), status: response.status };
    return { ok: true, data: unwrapTrpcData(body) };
  } catch (cause) {
    return { ok: false, error: String(cause), status: 500 };
  }
}

export async function load(event: LoadEvent) {
  const { locals, fetch: fetchFn, request, url } = event;

  if (!locals.session) throw redirect(302, "/auth/login");

  const result = await callTrpcQuery(
    fetchFn,
    getBaseUrl(url.href),
    "errorLogs.list",
    { limit: 20 },
    request.headers.get("cookie") ?? "",
  );
  if (!result.ok) {
    if (result.status === 401) throw redirect(302, "/auth/login");
    error(result.status === 403 ? 403 : 500, { message: result.error });
  }

  return {
    errorLogs: Array.isArray(result.data) ? (result.data as ErrorLogRow[]) : [],
  };
}

export const actions = {
  clear: async (event: ActionEvent) => {
    const { locals, fetch: fetchFn, request, url } = event;

    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const before = String(form.get("before") ?? "").trim();
    const input = before ? { before } : {};

    const result = await callTrpcMutation(
      fetchFn,
      getBaseUrl(url.href),
      "errorLogs.clear",
      input,
      request.headers.get("cookie") ?? "",
    );
    if (!result.ok) return fail(result.status, { clearError: result.error });

    const data = result.data as { deleted?: number } | null;
    return { ok: true, deleted: data?.deleted ?? 0 };
  },
};
