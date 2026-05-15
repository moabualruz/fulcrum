import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { ACTIVE_PROJECT_COOKIE } from "./lib/state/active-project.ts";
import { closeDatabase } from "./lib/server/db.ts";
import {
  __closeWebRuntimeForTest,
  __setWebRuntimeForTest,
  handle,
} from "./hooks.server.ts";

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

function createRequestEvent(pathname = "/") {
  return {
    ...createEvent(),
    request: new Request(`http://localhost${pathname}`),
  };
}

describe("hooks.server handle", () => {
  afterAll(async () => {
    await __closeWebRuntimeForTest();
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

  test("request locals receive web runtime EntityManager and container", async () => {
    const em = { marker: "em" } as never;
    const container = null;
    __setWebRuntimeForTest({
      authHandler: null,
      orm: { close: async () => undefined } as never,
      em,
      container,
    });

    const event = createRequestEvent("/api/probe");
    const resolve = (e: { locals: App.Locals }) => {
      expect(e.locals.em).toBe(em);
      expect(e.locals.container).toBe(container);
      return new Response("ok");
    };
    await handle({ event: event as never, resolve: resolve as never });
  });

  test("request locals receive independent EntityManager and container instances", async () => {
    let forkCount = 0;
    __setWebRuntimeForTest({
      authHandler: null,
      orm: { close: async () => undefined } as never,
      createRequestContext: () => ({
        em: { marker: `fork-${++forkCount}` } as never,
        container: null,
      }),
    });

    const observed: Array<Pick<App.Locals, "em" | "container">> = [];
    const resolve = (e: { locals: App.Locals }) => {
      observed.push({
        em: e.locals.em,
        container: e.locals.container,
      });
      return new Response("ok");
    };

    await handle({ event: createRequestEvent("/api/probe") as never, resolve: resolve as never });
    await handle({ event: createRequestEvent("/api/probe") as never, resolve: resolve as never });

    expect(observed).toHaveLength(2);
    expect(observed[0]?.em).not.toBe(observed[1]?.em);
    expect(observed[0]?.container).not.toBe(observed[1]?.container);
  });

  test("/api/auth requests use auth handler without allocating request runtime", async () => {
    let contextCalls = 0;
    let resolveCalls = 0;
    __setWebRuntimeForTest({
      authHandler: async () => new Response("auth"),
      orm: { close: async () => undefined } as never,
      createRequestContext: () => {
        contextCalls += 1;
        return {
          em: { clear: () => undefined } as never,
          container: null,
        };
      },
    });

    const response = await handle({
      event: createRequestEvent("/api/auth/sign-in") as never,
      resolve: (() => {
        resolveCalls += 1;
        return new Response("app");
      }) as never,
    });

    expect(await response.text()).toBe("auth");
    expect(contextCalls).toBe(0);
    expect(resolveCalls).toBe(0);
  });

  test("/api/trpc requests are delegated to the route layer after locals are populated", async () => {
    __setWebRuntimeForTest({
      authHandler: null,
      orm: { close: async () => undefined } as never,
      createRequestContext: () => ({
        em: { clear: () => undefined } as never,
        container: null,
      }),
    });

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
    expect(observedLocals?.em).not.toBeNull();
    expect(observedLocals?.container).not.toBeNull();
  });

  test("request EntityManager is cleared when resolve throws", async () => {
    let clearCalls = 0;
    __setWebRuntimeForTest({
      authHandler: null,
      orm: { close: async () => undefined } as never,
      createRequestContext: () => ({
        em: {
          clear: () => {
            clearCalls += 1;
          },
        } as never,
        container: null,
      }),
    });

    const thrown = new Error("resolve failed");
    await expect(handle({
      event: createRequestEvent("/api/probe") as never,
      resolve: (() => {
        throw thrown;
      }) as never,
    })).rejects.toBe(thrown);

    expect(clearCalls).toBe(1);
  });

  test("adds html dir for persisted RTL locale when i18n flag is on", async () => {
    const previous = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "i18n";
    __setWebRuntimeForTest({
      authHandler: null,
      orm: { close: async () => undefined } as never,
      createRequestContext: () => ({
        em: { clear: () => undefined } as never,
        container: {
          get: (token: string) => {
            if (token !== "TenantSettingRepository") throw new Error("unknown token");
            return { getValue: async (key: string) => key === "web.locale" ? "ar" : null };
          },
        } as never,
      }),
    });

    try {
      const response = await handle({
        event: createRequestEvent("/api/probe") as never,
        resolve: ((event, options) => {
          const html = options?.transformPageChunk?.({ html: '<html lang="en"><body>ok</body></html>', done: true }) ?? "";
          return new Response(html);
        }) as never,
      });

      expect(await response.text()).toContain('<html lang="ar" dir="rtl">');
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
