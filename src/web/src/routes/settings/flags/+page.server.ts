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

export interface FlagRow {
  name: string;
  enabled: boolean;
  description: string;
}

function getBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function extractTrpcError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  if (Array.isArray(body)) {
    const first = body[0] as { error?: { json?: { message?: string } } } | undefined;
    if (first?.error?.json?.message) return first.error.json.message;
  }

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
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}?input=%7B%7D`, {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: extractTrpcError(body), status: response.status };
    }

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

    if (!response.ok) {
      return { ok: false, error: extractTrpcError(body), status: response.status };
    }

    return { ok: true, data: unwrapTrpcData(body) };
  } catch (cause) {
    return { ok: false, error: String(cause), status: 500 };
  }
}

async function requireOwnerOrAdmin(
  event: LoadEvent | ActionEvent,
  baseUrl: string,
  cookieHeader: string,
): Promise<void> {
  const result = await callTrpcQuery(event.fetch, baseUrl, "orgs.members.list", cookieHeader);
  if (result.ok) return;

  if (result.status === 403) {
    error(403, { message: "Only org owners and admins can access feature flags." });
  }
  if (result.status === 401) {
    throw redirect(302, "/auth/login");
  }
  error(500, { message: result.error });
}

export async function load(event: LoadEvent) {
  const { locals, fetch: fetchFn, request, url } = event;

  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }

  const baseUrl = getBaseUrl(url.href);
  const cookieHeader = request.headers.get("cookie") ?? "";

  await requireOwnerOrAdmin(event, baseUrl, cookieHeader);

  const result = await callTrpcQuery(fetchFn, baseUrl, "flags.list", cookieHeader);
  if (!result.ok) {
    if (result.status === 403) {
      error(403, { message: "Only org owners and admins can access feature flags." });
    }
    if (result.status === 401) {
      throw redirect(302, "/auth/login");
    }
    error(500, { message: result.error });
  }

  const flags = Array.isArray(result.data) ? (result.data as FlagRow[]) : [];
  return { flags };
}

export const actions = {
  toggle: async (event: ActionEvent) => {
    const { locals, fetch: fetchFn, request, url } = event;

    if (!locals.session) {
      throw redirect(302, "/auth/login");
    }

    const form = await request.formData();
    const flag = String(form.get("flag") ?? "").trim();
    const enabledValue = String(form.get("enabled") ?? "").trim();

    if (!flag || (enabledValue !== "true" && enabledValue !== "false")) {
      return fail(400, { toggleError: "Flag and enabled state are required." });
    }

    const baseUrl = getBaseUrl(url.href);
    const cookieHeader = request.headers.get("cookie") ?? "";

    await requireOwnerOrAdmin(event, baseUrl, cookieHeader);

    const result = await callTrpcMutation(
      fetchFn,
      baseUrl,
      "flags.set",
      { flag, enabled: enabledValue === "true" },
      cookieHeader,
    );

    if (!result.ok) {
      return fail(result.status === 403 ? 403 : 400, { toggleError: result.error, flag });
    }

    return { ok: true, flag };
  },
};
