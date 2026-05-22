/**
 * SvelteKit tRPC route handler: /api/trpc/[...path]
 *
 * Delegates all /api/trpc/** requests to the server-owned HTTP endpoint.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

/**
 * Handles GET and POST requests to /api/trpc/[...path].
 * tRPC uses GET for queries (with batching) and POST for mutations.
 */
async function handler(event: RequestEvent): Promise<Response> {
  const url = new URL(event.url);
  const upstream = await event.fetch(new URL(`${url.pathname}${url.search}`, publicApiBaseUrl(event.url)), {
    method: event.request.method,
    headers: {
      ...cookieHeaders(event.request),
      "content-type": event.request.headers.get("content-type") ?? "application/json",
    },
    body: event.request.method === "GET" || event.request.method === "HEAD" ? undefined : event.request.body,
    credentials: "include",
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

export const GET = handler;
export const POST = handler;
