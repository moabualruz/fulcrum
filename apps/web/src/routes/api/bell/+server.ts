import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function unwrapCount(body: unknown): number {
  return Math.max(0, Number((body as { count?: unknown })?.count ?? 0));
}

function extractMessage(body: unknown): string {
  const error = (body as { error?: { message?: string } })?.error;
  return error?.message ?? (body as { message?: string })?.message ?? "Bell count request failed.";
}

function publicApiBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env["FULCRUM_SERVER_URL"] ?? env["FULCRUM_PUBLIC_API_URL"];
  return raw ? raw.replace(/\/+$/, "") : null;
}

function publicUnreadCountUrl(base: string, locals: App.Locals): string | null {
  if (!locals.orgId || !locals.userId) return null;
  const url = new URL("/api/v1/notifications/unread-count", base);
  url.searchParams.set("orgId", locals.orgId);
  url.searchParams.set("userId", locals.userId);
  return url.toString();
}

export const GET: RequestHandler = async ({ fetch, locals, request, url }) => {
  const publicBase = publicApiBaseUrl();
  const publicUrl = publicUnreadCountUrl(publicBase ?? baseUrl(url), locals);
  if (!publicUrl) {
    return json({ error: "Notification scope is required." }, { status: 401 });
  }
  const response = await fetch(publicUrl, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return json({ error: extractMessage(body) }, { status: response.status });
  }
  const count = unwrapCount(body);
  return json({ count });
};
