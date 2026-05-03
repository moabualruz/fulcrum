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
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

export interface TelemetryStatus {
  opted_in: boolean;
  row_count: number;
}

function getBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function unwrapTrpcData(body: unknown): unknown {
  return (
    (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
    (body as { result?: { data?: unknown } })?.result?.data ??
    body
  );
}

function extractTrpcError(body: unknown): string {
  const errorBody = (body as { error?: unknown } | null)?.error;
  if (errorBody && typeof errorBody === "object") {
    const errorRecord = errorBody as Record<string, unknown>;
    if (typeof errorRecord["message"] === "string") return errorRecord["message"];
    const json = errorRecord["json"] as Record<string, unknown> | undefined;
    if (json && typeof json["message"] === "string") return json["message"];
  }
  return "Request failed";
}

async function callTrpcQuery(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}?input=%7B%7D`, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, error: extractTrpcError(body) };
  return { ok: true, data: unwrapTrpcData(body) };
}

async function callTrpcMutation(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify({ json: {} }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, error: extractTrpcError(body) };
  return { ok: true, data: unwrapTrpcData(body) };
}

function requireSession(locals: RouteLocals): void {
  if (!locals.session) throw redirect(302, "/auth/login");
}

export async function load(event: LoadEvent) {
  requireSession(event.locals);
  const baseUrl = getBaseUrl(event.url.href);
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const result = await callTrpcQuery(event.fetch, baseUrl, "telemetry.status", cookieHeader);

  if (!result.ok) {
    if (result.status === 401) throw redirect(302, "/auth/login");
    error(500, { message: result.error });
  }

  return { status: result.data as TelemetryStatus };
}

async function mutationAction(event: ActionEvent, procedure: string) {
  requireSession(event.locals);
  const baseUrl = getBaseUrl(event.url.href);
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const result = await callTrpcMutation(event.fetch, baseUrl, procedure, cookieHeader);

  if (!result.ok) {
    if (result.status === 401) throw redirect(302, "/auth/login");
    return fail(result.status, { telemetryError: result.error });
  }

  return result.data;
}

export const actions = {
  optIn: (event: ActionEvent) => mutationAction(event, "telemetry.optIn"),
  optOut: (event: ActionEvent) => mutationAction(event, "telemetry.optOut"),
  purge: (event: ActionEvent) => mutationAction(event, "telemetry.purge"),
};
