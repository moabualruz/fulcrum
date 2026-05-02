import { afterAll, describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { ACTIVE_PROJECT_COOKIE } from "./lib/state/active-project.ts";
import {
  __closeWebRuntimeForTest,
  __setWebRuntimeForTest,
  handle,
} from "./hooks.server.ts";
import { FULCRUM_REQUEST_ID_HEADER } from "../../../src/trpc/context.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const container = new Container();
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
        container: new Container(),
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
          container: new Container(),
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

  test("hook-mounted tRPC responses include request id header", async () => {
    __setWebRuntimeForTest({
      authHandler: null,
      orm: { close: async () => undefined } as never,
      createRequestContext: () => ({
        em: { clear: () => undefined } as never,
        container: new Container(),
      }),
    });

    const response = await handle({
      event: createRequestEvent("/api/trpc/health.ping") as never,
      resolve: (() => new Response("app")) as never,
    });

    expect(response.headers.get(FULCRUM_REQUEST_ID_HEADER)).toMatch(UUID_RE);
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
        container: new Container(),
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
});
