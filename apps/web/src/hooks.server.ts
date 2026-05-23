/**
 * SvelteKit hooks.server.ts
 *
 * Responsibilities:
 *   1. Mount Better-Auth handler on /api/auth/** (AuthService.handler).
 *   2. Populate invocation-layer locals before SvelteKit routes run.
 *   3. Inject event.locals.session on every request (null if unauthenticated).
 *   4. Derive event.locals.orgId from the Better-Auth session payload.
 *   5. Set event.locals.activeProjectId from cookie.
 *
 * C6: No raw SQL.
 */

import type { Handle } from "@sveltejs/kit";

import { getActiveProject } from "./lib/state/active-project.ts";
import { dirForLocale, isI18nEnabled, normalizeLocale } from "$lib/i18n/index.ts";

interface HydratedSession {
  session: App.Locals["session"];
  orgId: string | null;
  userId: string | null;
}

async function hydrateSession(
  request: Request,
  fetchFn: typeof fetch,
): Promise<HydratedSession> {
  try {
    const sessionResponse = await fetchFn(
      publicApiUrl(request, "/api/v1/auth/whoami"),
      {
        headers: request.headers,
        credentials: "include",
      },
    );
    if (!sessionResponse.ok) return emptySession();

    const body = await sessionResponse.json().catch(() => null);
    if (!body || typeof body !== "object" || !("session" in body)) {
      return emptySession();
    }

    const session = (body as { session?: App.Locals["session"] }).session ?? body;

    return {
      session,
      orgId: (body as { orgId?: string }).orgId ?? (session as { orgId?: string }).orgId ?? null,
      userId: (body as { userId?: string }).userId ?? (session as { userId?: string }).userId ?? null,
    };
  } catch {
    return emptySession();
  }
}

function emptySession(): HydratedSession {
  return { session: null, orgId: null, userId: null };
}

export async function __getWebRuntimeForTest(): Promise<{ em: null; container: null }> {
  return { em: null, container: null };
}

export function __setWebRuntimeForTest(_runtime: unknown): void {
  // Web no longer owns an in-process runtime; tests may still call this legacy hook.
}

export async function __closeWebRuntimeForTest(): Promise<void> {
  return;
}

export const handle: Handle = async ({ event, resolve }) => {
  let locale = "en";
  const i18nEnabled = isI18nEnabled();

  // 1. Active project cookie (existing behaviour: must stay first for test compat)
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
      return await proxyAuthRequest(request).catch(() => resolve(event));
    }
    const sessionState = await hydrateSession(request, event.fetch);
    const effectiveSessionState = !sessionState.session && !process.env["FULCRUM_REQUIRE_AUTH"]
      ? localDevSession()
      : sessionState;

    const routeSessionState = url.pathname.startsWith("/auth") ? sessionState : effectiveSessionState;
    event.locals.session = routeSessionState.session;
    event.locals.orgId = routeSessionState.orgId;
    event.locals.userId = routeSessionState.userId;

    // In local/dev mode, auto-create a session so users don't need to log in.
    // Production (SaaS) mode requires real auth via Better-Auth.
    // Auth guard: only active when FULCRUM_REQUIRE_AUTH is set (SaaS mode).
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
};

// Seeded local admin (matches services/identity-access seed; same as /api/v1/auth/whoami
// resolves for the local Better-Auth bypass). Using the real UUID lets server commands
// that hydrate Org/User by id (e.g. addSettingsSecret) succeed without auth wiring.
const LOCAL_DEV_USER_ID = "ac09598f-ce28-4c3a-9ba0-262771456a19";

function localDevSession(): HydratedSession {
  const userId = process.env["FULCRUM_USER_ID"] ?? LOCAL_DEV_USER_ID;
  return {
    session: { userId },
    orgId: process.env["FULCRUM_ORG_ID"] ?? "00000000-0000-0000-0000-000000000001",
    userId,
  };
}

async function proxyAuthRequest(request: Request): Promise<Response> {
  const response = await fetch(publicApiUrl(request, new URL(request.url).pathname + new URL(request.url).search), {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return response;
}

function publicApiUrl(request: Request, path: string): string {
  const current = new URL(request.url);
  const base = process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? process.env["FULCRUM_API_URL"];
  return new URL(path, base ?? `${current.protocol}//${current.host}`).toString();
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
