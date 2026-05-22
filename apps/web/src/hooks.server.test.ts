import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, test } from "bun:test";

import { ACTIVE_PROJECT_COOKIE } from "./lib/state/active-project.ts";
import { closeDatabase } from "./lib/server/db.ts";
import { handle } from "./hooks.server.ts";

/**
 * Post-retirement contract.
 *
 * The in-process DB plumbing is gone: `hooks.server.ts` no longer opens a
 * database, allocates a per-request EntityManager, or builds a DI container.
 * The web process is a pure invocation layer. `event.locals` now carries only
 * invocation-layer identity — `session` / `orgId` / `userId` / `activeProjectId`
 * — while `em` and `container` are permanently `null` (the `App.Locals` shape
 * keeps the fields only so route code that still reads them sees `null`).
 *
 * `hydrateSession` reaches the backend over `event.fetch` (the public auth
 * endpoint), and `/api/auth/**` requests are proxied to the server. These
 * tests assert that delegation and the `em`/`container` retirement invariant,
 * not the removed runtime allocation.
 */

function createCookiesStub(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(ACTIVE_PROJECT_COOKIE, initial);
  return {
    get(name: string): string | undefined {
      return store.get(name);
    },
    set(): void {},
    delete(): void {},
  };
}

function createEvent(cookieValue?: string) {
  return {
    cookies: createCookiesStub(cookieValue),
    locals: {} as App.Locals,
  };
}

/**
 * A request-shaped event. `fetch` answers the auth `whoami` probe so
 * `hydrateSession` resolves deterministically without a network round-trip;
 * by default it reports an unauthenticated session.
 */
function createRequestEvent(
  pathname = "/",
  fetchStub?: typeof fetch,
) {
  const recordedFetches: string[] = [];
  const defaultFetch = (async (input: URL | string | Request) => {
    recordedFetches.push(String(input));
    return new Response(JSON.stringify({ session: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    ...createEvent(),
    request: new Request(`http://localhost${pathname}`),
    fetch: fetchStub ?? defaultFetch,
    recordedFetches,
  };
}

describe("hooks.server handle", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  test("locals.activeProjectId is null when cookie unset", async () => {
    const event = createEvent();
    const calls: unknown[] = [];
    const resolve = (e: unknown) => {
      calls.push(e);
      return new Response("ok");
    };
    await handle({ event: event as never, resolve: resolve as never });
    expect(event.locals.activeProjectId).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(event);
  });

  test("locals.activeProjectId is slug when cookie holds valid slug", async () => {
    const event = createEvent("fulcrum");
    const resolve = () => new Response("ok");
    await handle({ event: event as never, resolve: resolve as never });
    expect(event.locals.activeProjectId).toBe("fulcrum");
  });

  test("locals.activeProjectId is null when cookie holds invalid value", async () => {
    const event = createEvent("NOT VALID");
    const resolve = () => new Response("ok");
    await handle({ event: event as never, resolve: resolve as never });
    expect(event.locals.activeProjectId).toBeNull();
  });

  test("resolve is called exactly once with event after locals populated", async () => {
    const event = createEvent("fulcrum");
    let callCount = 0;
    let observedSlug: string | null | undefined;
    const resolve = (e: { locals: App.Locals }) => {
      callCount += 1;
      observedSlug = e.locals.activeProjectId;
      return new Response("ok");
    };
    await handle({ event: event as never, resolve: resolve as never });
    expect(callCount).toBe(1);
    expect(observedSlug).toBe("fulcrum");
  });

  test("request locals never receive an in-process EntityManager or container", async () => {
    // The in-process DB runtime is retired: the web process is an invocation
    // layer and must not allocate an EntityManager / DI container per request.
    // `em` and `container` stay `null` for the whole request lifecycle.
    const event = createRequestEvent("/api/probe");
    let observed: Pick<App.Locals, "em" | "container"> | null = null;
    const resolve = (e: { locals: App.Locals }) => {
      observed = { em: e.locals.em, container: e.locals.container };
      return new Response("ok");
    };
    await handle({ event: event as never, resolve: resolve as never });

    expect(observed).not.toBeNull();
    expect(observed!.em).toBeNull();
    expect(observed!.container).toBeNull();
  });

  test("request locals are populated from the auth whoami endpoint over event.fetch", async () => {
    // `hydrateSession` delegates session resolution to the server-owned auth
    // endpoint via `event.fetch`; the resolved identity lands on locals.
    const whoamiFetch = (async (input: URL | string | Request) => {
      const target = String(input);
      if (target.includes("/api/v1/auth/whoami")) {
        return new Response(
          JSON.stringify({
            session: { userId: "user-7" },
            orgId: "org-7",
            userId: "user-7",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const event = createRequestEvent("/api/probe", whoamiFetch);
    let observed: App.Locals | null = null;
    const resolve = (e: { locals: App.Locals }) => {
      observed = e.locals;
      return new Response("ok");
    };
    await handle({ event: event as never, resolve: resolve as never });

    expect(observed).not.toBeNull();
    expect(observed!.orgId).toBe("org-7");
    expect((observed as App.Locals & { userId?: string | null }).userId).toBe("user-7");
    expect(observed!.session).toMatchObject({ userId: "user-7" });
  });

  test("unauthenticated /api requests fall back to a local-dev session when auth is not required", async () => {
    // Local/dev mode (no FULCRUM_REQUIRE_AUTH): when the auth backend reports
    // no session, the hook synthesizes a local-dev session so the operator
    // does not have to log in. The whoami body here omits a `session` key,
    // which `hydrateSession` treats as an empty session.
    const previous = process.env["FULCRUM_REQUIRE_AUTH"];
    delete process.env["FULCRUM_REQUIRE_AUTH"];
    const noSessionFetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const event = createRequestEvent("/api/probe", noSessionFetch);
      let observed: App.Locals | null = null;
      const resolve = (e: { locals: App.Locals }) => {
        observed = e.locals;
        return new Response("ok");
      };
      await handle({ event: event as never, resolve: resolve as never });

      expect(observed).not.toBeNull();
      expect(observed!.session).not.toBeNull();
      expect(observed!.orgId).not.toBeNull();
    } finally {
      if (previous === undefined) delete process.env["FULCRUM_REQUIRE_AUTH"];
      else process.env["FULCRUM_REQUIRE_AUTH"] = previous;
    }
  });

  test("/api/auth requests skip session hydration and never enter the route layer", async () => {
    // `/api/auth/**` is mounted on the server-owned Better-Auth handler: the
    // hook proxies the request and returns before `hydrateSession` runs, so
    // `event.fetch` (the whoami probe) is never called and session locals stay
    // at their defaults. The route `resolve` is only reached via the proxy's
    // failure fallback — never as the primary path.
    const event = createRequestEvent("/api/auth/sign-in");
    let resolveCalls = 0;
    const response = await handle({
      event: event as never,
      resolve: (() => {
        resolveCalls += 1;
        return new Response("app");
      }) as never,
    });

    expect(response).toBeInstanceOf(Response);
    // The whoami probe is the tell-tale of the normal hydration path; the
    // auth-proxy branch must bypass it entirely.
    expect(event.recordedFetches).toHaveLength(0);
    expect(event.locals.session).toBeNull();
    expect(event.locals.em).toBeNull();
    // resolve is only ever the proxy fallback for /api/auth, never the
    // session-hydrating route path.
    expect(resolveCalls).toBeLessThanOrEqual(1);
  });

  test("/api/trpc requests are delegated to the route layer after locals are populated", async () => {
    let resolveCalls = 0;
    let observedLocals: App.Locals | null = null;
    const response = await handle({
      event: createRequestEvent("/api/trpc/health.ping") as never,
      resolve: ((event) => {
        resolveCalls += 1;
        observedLocals = event.locals;
        return new Response("route-layer");
      }) as never,
    });

    expect(await response.text()).toBe("route-layer");
    expect(resolveCalls).toBe(1);
    // Locals carry invocation-layer identity, never a DB seam.
    expect(observedLocals).not.toBeNull();
    expect(observedLocals!.em).toBeNull();
    expect(observedLocals!.container).toBeNull();
    expect("activeProjectId" in observedLocals!).toBe(true);
  });

  test("resolve errors propagate unchanged from the invocation layer", async () => {
    // The hook adds no try/finally cleanup around `resolve` (there is no
    // request runtime to tear down); a thrown error must surface verbatim.
    const thrown = new Error("resolve failed");
    const event = createRequestEvent("/api/probe");
    await expect(handle({
      event: event as never,
      resolve: (() => {
        throw thrown;
      }) as never,
    })).rejects.toBe(thrown);
  });

  test("adds html dir for RTL locale when the i18n feature flag is on", async () => {
    // The i18n transform is driven by the `FULCRUM_FEATURES` env flag, not by
    // a per-request container lookup — no runtime allocation is involved.
    const previous = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "i18n";
    try {
      const response = await handle({
        event: createRequestEvent("/api/probe") as never,
        resolve: ((_event, options) => {
          const html = options?.transformPageChunk?.({ html: '<html lang="en"><body>ok</body></html>', done: true }) ?? "";
          return new Response(html);
        }) as never,
      });

      expect(await response.text()).toContain('<html lang="en"');
    } finally {
      if (previous === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previous;
    }
  });

  test("hooks do not import or mount the server tRPC runtime", async () => {
    const source = await readFile(new URL("./hooks.server.ts", import.meta.url), "utf8");

    expect(source).not.toContain("@trpc/server");
    expect(source).not.toContain("@fulcrum/server/trpc");
    expect(source).not.toContain("fetchRequestHandler");
  });
});
