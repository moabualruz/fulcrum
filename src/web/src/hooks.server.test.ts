import { describe, expect, test } from "bun:test";

import { ACTIVE_PROJECT_COOKIE } from "./lib/state/active-project.ts";
import { handle } from "./hooks.server.ts";

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

describe("hooks.server handle", () => {
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
});
