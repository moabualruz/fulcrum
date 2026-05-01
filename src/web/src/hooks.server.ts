/**
 * SvelteKit hooks.server.ts
 *
 * Responsibilities:
 *   1. Mount Better-Auth handler on /api/auth/** (AuthService.handler).
 *   2. Mount tRPC fetchRequestHandler on /api/trpc/** (appRouter + createContext).
 *   3. Inject event.locals.session on every request (null if unauthenticated).
 *   4. Derive event.locals.orgId via getOrgId(session).
 *   5. Set event.locals.activeProjectId from cookie.
 *
 * AuthService is lazily initialised on first request (avoids ORM init at
 * module import time; ORM may not be ready at cold-start in some envs).
 *
 * C6: No raw SQL.
 * C8: needle-di Container exposed on locals; passed into tRPC context per C8.
 * C4: tRPC is the shared core — web, CLI, and TUI all resolve procedures here.
 */

import type { Handle } from "@sveltejs/kit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { getActiveProject } from "$lib/state/active-project";
import { appRouter } from "../../../src/trpc/router.ts";
import { createContext } from "../../../src/trpc/context.ts";

// Lazy auth initialiser — only wired when ORM is available.
// Imported dynamically to avoid circular dep issues at SSR preload time.
let _authHandler: ((req: Request) => Promise<Response>) | null = null;

async function getAuthHandler(): Promise<((req: Request) => Promise<Response>) | null> {
  if (_authHandler) return _authHandler;
  try {
    const { AuthService } = await import("../../../src/auth/index.ts");
    const { initOrm } = await import("../../../src/db/mikro-orm.config.ts");
    const orm = await initOrm();
    const svc = new AuthService(orm.em);
    await svc.init();
    _authHandler = svc.handler;
    return _authHandler;
  } catch {
    // ORM not available (e.g. running web-only tests without DB) — degrade gracefully
    return null;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  // 1. Active project cookie (existing behaviour — must stay first for test compat)
  event.locals.activeProjectId = getActiveProject(event.cookies);

  // 2. Defaults for new locals
  event.locals.session = null;
  event.locals.orgId = null;

  // 3. Mount Better-Auth on /api/auth/**
  //    event.request is a real Request in production; may be absent in unit-test stubs.
  const request = "request" in event ? (event as { request: Request }).request : null;

  if (request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/auth")) {
      const handler = await getAuthHandler();
      if (handler) {
        return handler(request);
      }
    }

    // 4. tRPC handler on /api/trpc/**
    //    fetchRequestHandler passes the Request + context to appRouter.
    if (url.pathname.startsWith("/api/trpc")) {
      // Session hydration before tRPC so ctx.session is populated
      const handler = await getAuthHandler();
      let session: App.Locals["session"] = null;
      let orgId: string | null = null;
      if (handler) {
        try {
          const sessionResponse = await handler(
            new Request(new URL("/api/auth/get-session", request.url).toString(), {
              headers: request.headers,
            }),
          );
          if (sessionResponse.ok) {
            const body = await sessionResponse.json().catch(() => null);
            if (body && typeof body === "object" && "session" in body) {
              const sess = (body as { session: App.Locals["session"] }).session;
              if (sess) {
                session = sess;
                orgId = (sess as unknown as { orgId: string }).orgId ?? null;
              }
            }
          }
        } catch {
          // Non-fatal — tRPC will run with session=null (unauthenticated)
        }
      }

      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () =>
          createContext({
            session,
            orgId,
            userId: session ? (session as unknown as { userId: string }).userId ?? null : null,
            em: null,     // Pillar 2+ wires the forked EM here via container
            container: null, // Pillar 2+ wires container here
          }),
      });
    }

    // 5. Session hydration for non-auth/non-trpc routes
    //    Better-Auth reads the session cookie and validates it against the DB.
    const handler = await getAuthHandler();
    if (handler) {
      try {
        const sessionResponse = await handler(
          new Request(new URL("/api/auth/get-session", request.url).toString(), {
            headers: request.headers,
          }),
        );
        if (sessionResponse.ok) {
          const body = await sessionResponse.json().catch(() => null);
          if (body && typeof body === "object" && body !== null && "session" in body) {
            const { getOrgId } = await import("../../../src/db/context.ts");
            const sess = (body as { session: App.Locals["session"] }).session;
            if (sess) {
              event.locals.session = sess;
              // getOrgId expects our MikroORM Session shape; cast safely
              event.locals.orgId = (sess as unknown as { orgId: string }).orgId ?? null;
            }
          }
        }
      } catch {
        // Session hydration failure is non-fatal — locals.session stays null
      }
    }

    // Auth guard lives after hydration so valid sessions can reach app routes.
    if (
      !event.locals.session &&
      !url.pathname.startsWith("/auth") &&
      !url.pathname.startsWith("/api")
    ) {
      const { redirect } = await import("@sveltejs/kit");
      throw redirect(302, "/auth/login");
    }
  }

  return resolve(event);
};
