import type { RequestHandler } from "@sveltejs/kit";

import {
  clearActiveProject,
  setActiveProject,
} from "$lib/state/active-project";

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: RequestHandler = async ({ cookies, request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("invalid JSON body");
  }
  const slug =
    payload && typeof payload === "object" && "slug" in payload
      ? (payload as { slug: unknown }).slug
      : undefined;
  if (slug === null) {
    clearActiveProject(cookies);
    return new Response(null, { status: 204 });
  }
  if (typeof slug !== "string" || slug.length === 0) {
    return jsonError("invalid project slug");
  }
  try {
    setActiveProject(cookies, slug);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "invalid slug";
    return jsonError(msg);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
  clearActiveProject(cookies);
  return new Response(null, { status: 204 });
};
