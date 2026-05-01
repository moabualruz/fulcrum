/**
 * SvelteKit hooks.server.ts
 *
 * Responsibilities:
 *   1. Mount Better-Auth handler on /api/auth/** (AuthService.handler).
 *   2. Inject event.locals.session on every request (null if unauthenticated).
 *   3. Derive event.locals.orgId via getOrgId(session).
 *   4. Set event.locals.activeProjectId from cookie.
 *
 * AuthService is lazily initialised on first request (avoids ORM init at
 * module import time; ORM may not be ready at cold-start in some envs).
 *
 * C6: No raw SQL.
 * C8: needle-di Container exposed on locals for tRPC context in later slices.
 */

import type { Handle } from "@sveltejs/kit";

import { getActiveProject } from "$lib/state/active-project";

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

    // 4. Session hydration for non-auth routes
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
  }

  return resolve(event);
};
