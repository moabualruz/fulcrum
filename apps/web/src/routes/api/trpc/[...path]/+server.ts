/**
 * SvelteKit tRPC route handler: /api/trpc/[...path]
 *
 * Delegates all /api/trpc/** requests to the server-owned route handler.
 * createContext reads session from event.locals (populated by hooks.server.ts).
 *
 * C8: container from event.locals wired into context (Pillar 2+ registers it).
 */

import type { RequestEvent } from "@sveltejs/kit";

import { handleTrpcRoute } from "@fulcrum/server/public-api/trpc-route-handler.ts";

/**
 * Handles GET and POST requests to /api/trpc/[...path].
 * tRPC uses GET for queries (with batching) and POST for mutations.
 */
async function handler(event: RequestEvent): Promise<Response> {
  return handleTrpcRoute({
    request: event.request,
    session: event.locals.session,
    orgId: event.locals.orgId,
    userId: event.locals.session
      ? (event.locals.session as unknown as { userId: string }).userId ?? null
      : null,
    em: event.locals.em ?? null,
    container: event.locals.container ?? null,
  });
}

export const GET = handler;
export const POST = handler;
