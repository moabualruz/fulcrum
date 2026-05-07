/**
 * /settings/experiments — server page for A/B experiment admin UI.
 * Gated by FULCRUM_FEATURES=experiments (C1).
 * Flag OFF → 404.
 */

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

export interface ExperimentRow {
  id: string;
  name: string;
  description: string;
  variants: string[];
  rolloutPercent: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
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
    const rec = errorBody as Record<string, unknown>;
    if (typeof rec["message"] === "string") return rec["message"];
    const json = rec["json"] as Record<string, unknown> | undefined;
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
    const encodedInput = encodeURIComponent(JSON.stringify({ json: input }));
    const response = await fetchFn(
      `${baseUrl}/api/trpc/${procedure}?input=${encodedInput}`,
      {
        method: "GET",
        credentials: "include",
        headers: { "content-type": "application/json", cookie: cookieHeader },
      },
    );
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
      headers: { "content-type": "application/json", cookie: cookieHeader },
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

  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }

  const baseUrl = getBaseUrl(url.href);
  const cookieHeader = request.headers.get("cookie") ?? "";

  // Check experiments flag — 404 when OFF
  const flagResult = await callTrpcQuery(fetchFn, baseUrl, "flags.experiments.list", {}, cookieHeader);
  if (!flagResult.ok) {
    if (flagResult.error === "FEATURE_DISABLED" || flagResult.status === 403) {
      error(404, { message: "Experiments feature is not enabled." });
    }
    if (flagResult.status === 401) throw redirect(302, "/auth/login");
    error(500, { message: flagResult.error });
  }

  const experiments = Array.isArray(flagResult.data)
    ? (flagResult.data as ExperimentRow[])
    : [];

  return { experiments };
}

export const actions = {
  create: async (event: ActionEvent) => {
    const { locals, fetch: fetchFn, request, url } = event;
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const variantsRaw = String(form.get("variants") ?? "").trim();
    const rolloutPercent = Number(form.get("rolloutPercent") ?? "100");

    if (!name) return fail(400, { createError: "Name is required." });
    const variants = variantsRaw.split(",").map((v) => v.trim()).filter(Boolean);
    if (variants.length < 2) return fail(400, { createError: "At least 2 variants required." });

    const uniqueVariants = new Set(variants);
    if (uniqueVariants.size !== variants.length) {
      return fail(400, { createError: "Variant names must be unique." });
    }

    const baseUrl = getBaseUrl(url.href);
    const cookieHeader = request.headers.get("cookie") ?? "";

    const result = await callTrpcMutation(fetchFn, baseUrl, "flags.experiments.create", {
      name,
      description,
      variants,
      rolloutPercent,
    }, cookieHeader);

    if (!result.ok) {
      return fail(result.status === 403 ? 403 : 400, { createError: result.error });
    }

    return { ok: true };
  },
};
