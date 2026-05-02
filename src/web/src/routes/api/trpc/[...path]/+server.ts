/**
 * SvelteKit tRPC route handler — /api/trpc/[...path]
 *
 * Delegates all /api/trpc/** requests to the tRPC fetchRequestHandler.
 * createContext reads session from event.locals (populated by hooks.server.ts).
 *
 * C4: Web surface uses tRPC directly — no HTTP round-trip for server-side calls.
 * C8: container from event.locals wired into context (Pillar 2+ registers it).
 */

import type { RequestEvent } from "@sveltejs/kit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "../../../../../../trpc/router.ts";
import { createContext } from "../../../../../../trpc/context.ts";

/**
 * Handles GET and POST requests to /api/trpc/[...path].
 * tRPC uses GET for queries (with batching) and POST for mutations.
 */
async function handler(event: RequestEvent): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: event.request,
    router: appRouter,
    createContext: () =>
      createContext({
        session: event.locals.session,
        orgId: event.locals.orgId,
        userId: event.locals.session
          ? (event.locals.session as unknown as { userId: string }).userId ?? null
          : null,
        em: event.locals.em ?? null,
        container: event.locals.container ?? null,
      }),
  });
}

export const GET = handler;
export const POST = handler;
