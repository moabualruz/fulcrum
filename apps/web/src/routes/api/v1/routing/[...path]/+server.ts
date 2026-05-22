import type { RequestHandler } from "@sveltejs/kit";

import { cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

function targetUrl(event: Parameters<RequestHandler>[0]): string {
  const path = event.params.path ? `/${event.params.path}` : "";
  const target = new URL(`/api/v1/routing${path}`, publicApiBaseUrl(event.url));
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
