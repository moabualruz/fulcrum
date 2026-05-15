import { describe, expect, test } from "bun:test";

const forbiddenTransportPath = "/api/" + "tr" + "pc";

describe("/settings/experiments load", () => {
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
        url: new URL("http://localhost/settings/experiments"),
      });
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; location?: string }).status).toBe(302);
    expect((thrown as { status?: number; location?: string }).location).toBe("/auth/login");
  });

  test("loads experiments through the feature experiment public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.load({
      locals: { session: { userId: "user-1" } },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json([
          {
            id: "exp-1",
            name: "button-color",
            description: "Compare button colors",
            variants: ["control", "treatment"],
            rolloutPercent: 50,
            startDate: null,
            endDate: null,
            createdAt: "2026-05-15T00:00:00.000Z",
          },
        ]);
      },
      request: { headers: { get: () => "sid=session-1" } },
      url: new URL("http://localhost/settings/experiments"),
    });

    expect(result.experiments).toEqual([
      {
        id: "exp-1",
        name: "button-color",
        description: "Compare button colors",
        variants: ["control", "treatment"],
        rolloutPercent: 50,
        startDate: null,
        endDate: null,
        createdAt: "2026-05-15T00:00:00.000Z",
      },
    ]);
    expect(calls).toEqual([
      {
        url: "http://localhost/api/v1/feature-flags/experiments",
        init: {
          method: "GET",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=session-1",
          },
          body: undefined,
        },
      },
    ]);
  });

  test("returns not found when experiments are disabled", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    let thrown: unknown;

    try {
      await mod.load({
        locals: { session: { userId: "user-1" } },
        fetch: async () => Response.json({ message: "not found" }, { status: 404 }),
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/experiments"),
      });
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; body?: { message?: string } }).status).toBe(404);
    expect((thrown as { status?: number; body?: { message?: string } }).body?.message).toBe(
      "Experiments feature is not enabled.",
    );
  });
});

describe("/settings/experiments actions", () => {
  test("create writes through the feature experiment public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const form = new FormData();
    form.set("name", "button-color");
    form.set("description", "Compare button colors");
    form.set("variants", "control,treatment");
    form.set("rolloutPercent", "50");
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.actions.create({
      locals: { session: { userId: "user-1" } },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json({ id: "exp-1", name: "button-color" });
      },
      request: { headers: { get: () => "sid=session-1" }, formData: async () => form },
      url: new URL("http://localhost/settings/experiments"),
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("http://localhost/api/v1/feature-flags/experiments");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      "content-type": "application/json",
      cookie: "sid=session-1",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      name: "button-color",
      description: "Compare button colors",
      variants: ["control", "treatment"],
      rolloutPercent: 50,
    });
  });

  test("create validates variants before calling APIs", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);
    const form = new FormData();
    form.set("name", "button-color");
    form.set("variants", "control");

    const result = await mod.actions.create({
      locals: { session: { userId: "user-1" } },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: { headers: { get: () => null }, formData: async () => form },
      url: new URL("http://localhost/settings/experiments"),
    });

    expect(result).toMatchObject({
      status: 400,
      data: { createError: "At least 2 variants required." },
    });
  });
});
