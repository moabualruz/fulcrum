/**
 * SvelteKit hooks.server.ts
 *
 * Responsibilities:
 *   1. Mount Better-Auth handler on /api/auth/** (AuthService.handler).
 *   2. Populate request-scoped runtime locals before SvelteKit routes run.
 *   3. Inject event.locals.session on every request (null if unauthenticated).
 *   4. Derive event.locals.orgId from the Better-Auth session payload.
 *   5. Set event.locals.activeProjectId from cookie.
 *
 * AuthService is lazily initialised on first request (avoids ORM init at
 * module import time; ORM may not be ready at cold-start in some envs).
 *
 * C6: No raw SQL.
 * C8: needle-di Container exposed on locals for server route handlers.
 */

import type { Handle } from "@sveltejs/kit";

import { getActiveProject } from "./lib/state/active-project.ts";
import {
  clearWebRequestRuntime,
  closeWebRuntimeForTest,
  createDefaultWebRuntime,
  createWebRequestRuntime,
  localDevSession,
  type WebRequestRuntime,
  type WebRuntime,
} from "@platform-core/application/runtime/web-request-runtime.ts";
import { dirForLocale, isI18nEnabled, normalizeLocale } from "$lib/i18n/index.ts";
import { initDatabase } from "$lib/server/db";

// ─── Startup: initialise PGlite singleton (runs migrations once) ─────────────
// This top-level await runs when the server module is first loaded, before any
// request is handled. It replaces the per-request open+migrate pattern.
await initDatabase().catch((err) => {
  console.error("[hooks.server] Failed to init web database:", err);
});

interface HydratedSession {
  session: App.Locals["session"];
  orgId: string | null;
  userId: string | null;
}

let _runtimePromise: Promise<WebRuntime> | null = null;

async function getWebRuntime(): Promise<WebRuntime> {
  if (!_runtimePromise) {
    _runtimePromise = createDefaultWebRuntime().catch((error) => {
      _runtimePromise = null;
      throw error;
    });
  }
  return _runtimePromise;
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
  em: WebRequestRuntime["em"];
  container: WebRequestRuntime["container"];
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
  await closeWebRuntimeForTest(runtime);
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
      const effectiveSessionState = !sessionState.session && !process.env["FULCRUM_REQUIRE_AUTH"]
        ? await localDevSession(requestRuntime) as HydratedSession
        : sessionState;

      const routeSessionState = url.pathname.startsWith("/auth") ? sessionState : effectiveSessionState;
      event.locals.session = routeSessionState.session;
      event.locals.orgId = routeSessionState.orgId;
      event.locals.userId = routeSessionState.userId;

      // In local/dev mode, auto-create a session so users don't need to log in.
      // Production (SaaS) mode requires real auth via Better-Auth.
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
