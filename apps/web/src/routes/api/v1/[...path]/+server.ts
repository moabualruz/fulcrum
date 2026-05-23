import type { RequestHandler } from "@sveltejs/kit";

import { cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

/**
 * Catch-all proxy from the web's `/api/v1/<rest>` namespace to the NestJS
 * public API server. Client-side components that call `/api/v1/<thing>` from
 * the browser (no `fetch` arg from a page-server `load`) would otherwise hit
 * the SvelteKit dev server and receive its 404 HTML, which then trips
 * `JSON.parse` in the caller. This route forwards method, query, headers, and
 * body to the configured NestJS base URL.
 *
 * The `routing/[...path]/+server.ts` sibling is more specific and still wins
 * for `/api/v1/routing/*` requests by SvelteKit's match-most-specific rule.
 * The `/api/v1` root `+server.ts` likewise still serves OpenAPI gating.
 */
function targetUrl(event: Parameters<RequestHandler>[0]): string {
  const path = event.params.path ? `/${event.params.path}` : "";
  const target = new URL(`/api/v1${path}`, publicApiBaseUrl(event.url));
  target.search = event.url.search;
  return target.toString();
}

async function proxy(event: Parameters<RequestHandler>[0]) {
  const method = event.request.method;
  const headers: Record<string, string> = {
    ...cookieHeaders(event.request),
  };
  const contentType = event.request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  return await event.fetch(targetUrl(event), {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : event.request.body,
    duplex: "half",
  } as RequestInit & { duplex?: "half" });
}

export const GET: RequestHandler = proxy;
export const POST: RequestHandler = proxy;
export const PUT: RequestHandler = proxy;
export const PATCH: RequestHandler = proxy;
export const DELETE: RequestHandler = proxy;
