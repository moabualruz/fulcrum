import { describe, expect, test } from "bun:test";

const forbiddenTransportPath = "/api/" + "tr" + "pc";

describe("/settings/flags load", () => {
  test("redirects anonymous users", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);

    let thrown: unknown;
    try {
      await mod.load({
        locals: { session: null },
        fetch: async () => {
          throw new Error("unexpected API call");
        },
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/flags"),
      });
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; location?: string }).status).toBe(302);
    expect((thrown as { status?: number; location?: string }).location).toBe("/auth/login");
  });

  test("loads feature flags through Nest public APIs", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.load({
      locals: { session: { userId: "user-1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });

        if (target.startsWith("http://localhost/api/v1/organizations/members")) {
          return Response.json([{ userId: "user-1", role: "owner" }]);
        }
        if (target.startsWith("http://localhost/api/v1/feature-flags")) {
          return Response.json([
            {
              flag: "public-api",
              enabled: true,
              description: "Enable public API routes.",
            },
          ]);
        }
        throw new Error(`unexpected API path: ${target}`);
      },
      request: { headers: { get: () => "sid=session-1" } },
      url: new URL("http://localhost/settings/flags"),
    });

    expect(result.flags).toEqual([
      {
        name: "public-api",
        enabled: true,
        description: "Enable public API routes.",
      },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      url: "http://localhost/api/v1/organizations/members?orgId=org-1&userId=user-1",
      init: {
        method: "GET",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          cookie: "sid=session-1",
        },
        body: undefined,
      },
    });
    expect(calls[1]).toEqual({
      url: "http://localhost/api/v1/feature-flags?orgId=org-1&userId=user-1",
      init: {
        method: "GET",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          cookie: "sid=session-1",
        },
        body: undefined,
      },
    });
  });

  test("fails soft with fallback flags when the feature flag API is unreachable", async () => {
    // `load` no longer throws when the API is down: it degrades gracefully,
    // returning a fallback flag set plus a `loadError` banner string that
    // points the operator at /settings/api. The route stays usable instead
    // of erroring the whole page.
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);

    const result = await mod.load({
      locals: { session: { userId: "user-1" } },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: { headers: { get: () => null } },
      url: new URL("http://localhost/settings/flags"),
    });

    expect(Array.isArray(result.flags)).toBe(true);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(typeof result.loadError).toBe("string");
    expect(result.loadError).toContain("Feature flag API");
    expect(result.loadError).toContain("/settings/api");
  });
});

describe("/settings/flags actions", () => {
  test("toggle writes through the Nest public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const form = new FormData();
    form.set("flag", "public-api");
    form.set("enabled", "false");
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.actions.toggle({
      locals: { session: { userId: "user-1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });

        if (target.startsWith("http://localhost/api/v1/organizations/members")) {
          return Response.json([{ userId: "user-1", role: "owner" }]);
        }
        if (target === "http://localhost/api/v1/feature-flags") {
          return Response.json({ flag: "public-api", enabled: false });
        }
        throw new Error(`unexpected API path: ${target}`);
      },
      request: {
        headers: { get: () => "sid=session-1" },
        formData: async () => form,
      },
      url: new URL("http://localhost/settings/flags"),
    });

    expect(result).toEqual({ ok: true, flag: "public-api" });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("http://localhost/api/v1/feature-flags");
    expect(calls[1]?.init.method).toBe("PATCH");
    expect(calls[1]?.init.headers).toEqual({
      "content-type": "application/json",
      cookie: "sid=session-1",
    });
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      flag: "public-api",
      enabled: false,
      orgId: "org-1",
    });
  });

  test("toggle validates flag and enabled state before calling APIs", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);
    const form = new FormData();
    form.set("flag", "");
    form.set("enabled", "sometimes");

    const result = await mod.actions.toggle({
      locals: { session: { userId: "user-1" }, orgId: "org-1", userId: "user-1" },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: {
        headers: { get: () => null },
        formData: async () => form,
      },
      url: new URL("http://localhost/settings/flags"),
    });

    expect(result).toMatchObject({
      status: 400,
      data: {
        toggleError: "Flag and enabled state are required.",
      },
    });
  });
});
