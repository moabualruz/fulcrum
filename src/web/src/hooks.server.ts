/**
 * SvelteKit hooks.server.ts
 *
 * Responsibilities:
 *   1. Mount Better-Auth handler on /api/auth/** (AuthService.handler).
 *   2. Mount tRPC fetchRequestHandler on /api/trpc/** (appRouter + createContext).
 *   3. Inject event.locals.session on every request (null if unauthenticated).
 *   4. Derive event.locals.orgId from the Better-Auth session payload.
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
import { Container } from "@needle-di/core";
import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";

import { getActiveProject } from "./lib/state/active-project.ts";
import type { FlagRegistry } from "../../../src/flags/registry.ts";
import { dirForLocale, isI18nEnabled, normalizeLocale } from "$lib/i18n/index.ts";
import { initProductDb, getProductDb } from "$lib/server/db";

// ─── Startup: initialise PGlite singleton (runs migrations once) ─────────────
// This top-level await runs when the server module is first loaded, before any
// request is handled. It replaces the per-request open+migrate pattern.
await initProductDb().catch((err) => {
  console.error("[hooks.server] Failed to init ProductDb:", err);
});

// Lazy imports — tRPC router + context pull in the full ORM entity graph.
// Importing eagerly breaks Vite SSR because the entity files use syntax
// (e.g. Bun-specific APIs, .sql imports) that Vite's transform can't handle.
let _appRouter: any = null;
let _createContext: any = null;
async function getTrpc() {
  if (!_appRouter) {
    const mod = await import("../../../src/trpc/router.ts");
    _appRouter = mod.appRouter;
  }
  if (!_createContext) {
    const mod = await import("../../../src/trpc/context.ts");
    _createContext = mod.createContext;
  }
  return { appRouter: _appRouter, createContext: _createContext };
}

// Lazy auth initialiser — only wired when ORM is available.
// Imported dynamically to avoid circular dep issues at SSR preload time.
interface WebRequestRuntime {
  em: EntityManager;
  container: Container;
}

interface WebRuntime {
  authHandler: ((req: Request) => Promise<Response>) | null;
  orm: MikroORM;
  flagRegistry?: FlagRegistry;
  createRequestContext?: () => WebRequestRuntime;
  em?: EntityManager;
  container?: Container;
}

interface HydratedSession {
  session: App.Locals["session"];
  orgId: string | null;
  userId: string | null;
}

let _runtimePromise: Promise<WebRuntime> | null = null;

async function getWebRuntime(): Promise<WebRuntime> {
  if (!_runtimePromise) {
    _runtimePromise = (async () => {
      const { AuthService } = await import("../../../src/auth/index.ts");
      const { initOrm } = await import("../../../src/db/mikro-orm.config.ts");
      const { createFlagRegistry, registerDbBindings } = await import("../../../src/db/db.module.ts");

      const orm = await initOrm();
      const flagRegistry = createFlagRegistry(orm);

      let authHandler: ((req: Request) => Promise<Response>) | null = null;
      try {
        const svc = new AuthService(orm.em);
        await svc.init();
        authHandler = svc.handler;
      } catch {
        authHandler = null;
      }

      return {
        authHandler,
        orm,
        flagRegistry,
        createRequestContext: () => {
          const em = orm.em.fork();
          const container = new Container();
          registerDbBindings(container, orm, em, { flagRegistry });
          return { em, container };
        },
      };
    })().catch((error) => {
      _runtimePromise = null;
      throw error;
    });
  }
  return _runtimePromise;
}

function createWebRequestRuntime(runtime: WebRuntime): WebRequestRuntime {
  if (runtime.createRequestContext) {
    return runtime.createRequestContext();
  }

  if (!runtime.em || !runtime.container) {
    throw new Error("Web runtime is missing request context bindings.");
  }

  const maybeFork = runtime.em as EntityManager & {
    fork?: () => EntityManager;
  };

  if (typeof maybeFork.fork === "function") {
    throw new Error("Forkable web runtime must provide createRequestContext.");
  }

  return {
    em: runtime.em,
    container: runtime.container,
  };
}

function clearWebRequestRuntime(runtime: WebRequestRuntime | null): void {
  const maybeClear = runtime?.em as (EntityManager & { clear?: () => void }) | null;
  maybeClear?.clear?.();
}

async function getAuthHandler(): Promise<((req: Request) => Promise<Response>) | null> {
  try {
    return (await getWebRuntime()).authHandler;
  } catch {
    // ORM not available (e.g. running web-only tests without DB) — degrade gracefully
    return null;
  }
}

async function hydrateSession(
  request: Request,
  handler: ((req: Request) => Promise<Response>) | null,
): Promise<HydratedSession> {
  if (!handler) return emptySession();

  try {
    const sessionResponse = await handler(
      new Request(new URL("/api/auth/get-session", request.url).toString(), {
        headers: request.headers,
      }),
    );
    if (!sessionResponse.ok) return emptySession();

    const body = await sessionResponse.json().catch(() => null);
    if (!body || typeof body !== "object" || !("session" in body)) {
      return emptySession();
    }

    const session = (body as { session: App.Locals["session"] }).session;
    if (!session) return emptySession();

    return {
      session,
      orgId: (session as unknown as { orgId: string }).orgId ?? null,
      userId: (session as unknown as { userId: string }).userId ?? null,
    };
  } catch {
    return emptySession();
  }
}

function emptySession(): HydratedSession {
  return { session: null, orgId: null, userId: null };
}

export async function __getWebRuntimeForTest(): Promise<{
  em: EntityManager;
  container: Container;
}> {
  const runtime = await getWebRuntime();
  return createWebRequestRuntime(runtime);
}

export function __setWebRuntimeForTest(runtime: WebRuntime): void {
  _runtimePromise = Promise.resolve(runtime);
}

export async function __closeWebRuntimeForTest(): Promise<void> {
  const runtime = await _runtimePromise?.catch(() => null);
  _runtimePromise = null;
  const { __resetDefaultOrmForTest } = await import("../../../src/db/mikro-orm.config.ts");
  const closedDefaultOrm = await __resetDefaultOrmForTest();
  if (runtime?.orm && runtime.orm !== closedDefaultOrm) {
    await runtime.orm.close(true);
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  let requestRuntime: WebRequestRuntime | null = null;
  let locale = "en";
  let i18nEnabled = isI18nEnabled();

  try {
    // 1. Active project cookie (existing behaviour — must stay first for test compat)
    event.locals.activeProjectId = getActiveProject(event.cookies);

    // 2. Defaults for new locals
    event.locals.session = null;
    event.locals.orgId = null;
    event.locals.em = null;
    event.locals.container = null;

    // 3. Mount Better-Auth on /api/auth/**
    //    event.request is a real Request in production; may be absent in unit-test stubs.
    const request = "request" in event ? (event as { request: Request }).request : null;

    if (request) {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/auth")) {
        const handler = await getAuthHandler();
        if (handler) {
          return await handler(request);
        }
        return await resolve(event);
      }

      const runtime = await getWebRuntime().catch(() => null);
      if (runtime) {
        requestRuntime = createWebRequestRuntime(runtime);
        event.locals.em = requestRuntime.em;
        event.locals.container = requestRuntime.container;
        locale = await readPersistedLocale(requestRuntime.container);
      }
      const sessionState = await hydrateSession(request, runtime?.authHandler ?? null);

      // 4. tRPC handler on /api/trpc/**
      //    fetchRequestHandler passes the Request + context to appRouter.
      if (url.pathname.startsWith("/api/trpc")) {
        const trpc = await getTrpc();
        return await fetchRequestHandler({
          endpoint: "/api/trpc",
          req: request,
          router: trpc.appRouter,
          createContext: ({ resHeaders }) =>
            trpc.createContext({
              session: sessionState.session,
              orgId: sessionState.orgId,
              userId: sessionState.userId,
              em: requestRuntime?.em ?? null,
              container: requestRuntime?.container ?? null,
              db: getProductDb(),
              responseHeaders: resHeaders,
            }),
        });
      }

      // 5. Session hydration for non-auth/non-trpc routes
      //    Better-Auth reads the session cookie and validates it against the DB.
      event.locals.session = sessionState.session;
      event.locals.orgId = sessionState.orgId;

      // In local/dev mode, auto-create a session so users don't need to log in.
      // Production (SaaS) mode requires real auth via Better-Auth.
      if (!event.locals.session && !process.env["FULCRUM_REQUIRE_AUTH"] && !url.pathname.startsWith("/auth")) {
        event.locals.session = {
          id: "local-dev-session",
          userId: "local-admin",
          expiresAt: new Date(Date.now() + 86400000),
        } as App.Locals["session"];
        event.locals.orgId = "default";
        event.locals.userId = "local-admin";
      }

      // Auth guard — only active when FULCRUM_REQUIRE_AUTH is set (SaaS mode).
      if (
        !event.locals.session &&
        !url.pathname.startsWith("/auth") &&
        !url.pathname.startsWith("/api") &&
        !url.pathname.startsWith("/doctor")
      ) {
        const { redirect } = await import("@sveltejs/kit");
        throw redirect(302, "/auth/login");
      }
    }

    return await resolve(event, {
      transformPageChunk: ({ html }) => transformHtmlLocale(html, locale, i18nEnabled),
    });
  } finally {
    clearWebRequestRuntime(requestRuntime);
  }
};

async function readPersistedLocale(container: Container): Promise<string> {
  try {
    const repo = container.get("TenantSettingRepository") as
      | { getValue?: (key: string) => Promise<string | null | undefined> }
      | undefined;
    const value = await repo?.getValue?.("web.locale");
    return normalizeLocale(value);
  } catch {
    return "en";
  }
}

function transformHtmlLocale(html: string, locale: string, enabled: boolean): string {
  if (!enabled) return html.replace(/\sdir="(?:ltr|rtl)"/, "");
  const normalized = normalizeLocale(locale);
  const dir = dirForLocale(normalized, true);
  return html.replace(/<html\b([^>]*)>/, (_match, attrs: string) => {
    const clean = String(attrs)
      .replace(/\slang="[^"]*"/, "")
      .replace(/\sdir="[^"]*"/, "");
    return `<html${clean} lang="${normalized}" dir="${dir}">`;
  });
}
