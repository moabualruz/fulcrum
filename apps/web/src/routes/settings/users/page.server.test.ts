import { describe, expect, test } from "bun:test";

const forbiddenTransportPath = "/api/" + "tr" + "pc";

describe("/settings/users load", () => {
  test("redirects to /auth/login when no session", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let thrown: unknown;

    try {
      await mod.load({
        locals: { session: null, orgId: "org-1", userId: "user-owner" },
        fetch: async () => {
          throw new Error("unexpected API call");
        },
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/users"),
      });
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; location?: string }).status).toBe(302);
    expect((thrown as { status?: number; location?: string }).location).toBe("/auth/login");
  });

  test("returns members list from the organization public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.load({
      locals: { session: { id: "session-1", userId: "user-owner" }, orgId: "org-1", userId: "user-owner" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        if (target.includes("/api/v1/auth/sessions")) {
          return Response.json([{
            id: "session-remote",
            deviceType: "desktop",
            browser: "Firefox",
            ipAddress: "203.0.113.0",
            lastActiveAt: "2026-05-18T12:00:00.000Z",
            expiresAt: "2026-05-19T12:00:00.000Z",
            isCurrent: false,
          }]);
        }
        return Response.json([
          {
            id: "m1",
            userId: "user-owner",
            orgId: "org-1",
            role: "owner",
            joinedAt: "2024-01-01T00:00:00.000Z",
          },
        ]);
      },
      request: { headers: { get: () => "sid=session-1" } },
      url: new URL("http://localhost/settings/users"),
    });

    expect(result.members).toEqual([
      {
        id: "m1",
        userId: "user-owner",
        orgId: "org-1",
        role: "owner",
        joinedAt: "2024-01-01T00:00:00.000Z",
        email: null,
        emailVerified: false,
      },
    ]);
    expect(result.sessions).toEqual([expect.objectContaining({ id: "session-remote", ipAddress: "203.0.113.0" })]);
    expect(calls).toEqual([
      {
        url: "http://localhost/api/v1/organizations/members?orgId=org-1&userId=user-owner",
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
      {
        url: "http://localhost/api/v1/auth/sessions?orgId=org-1&userId=user-owner&currentSessionId=session-1",
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

  test("fails closed when scoped API callers are unavailable", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    let thrown: unknown;

    try {
      await mod.load({
        locals: { session: { userId: "user-owner" }, orgId: null, userId: "user-owner" },
        fetch: async () => {
          throw new Error("unexpected API call");
        },
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/users"),
      });
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; body?: { message?: string } }).status).toBe(503);
    expect((thrown as { status?: number; body?: { message?: string } }).body?.message).toBe(
      "User management API caller is not configured.",
    );
  });
});

describe("/settings/users actions", () => {
  test("invite creates an invitation through the public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const form = new FormData();
    form.set("email", "new@example.com");
    form.set("role", "member");
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.actions.invite({
      locals: { session: { userId: "user-owner" }, orgId: "org-1", userId: "user-owner" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json({ id: "inv-1", token: "tok-xyz" });
      },
      request: { headers: { get: () => "sid=session-1" }, formData: async () => form },
      url: new URL("http://localhost/settings/users"),
    });

    expect(result).toMatchObject({ inviteToken: "tok-xyz", inviteEmail: "new@example.com" });
    expect(calls[0]?.url).toBe("http://localhost/api/v1/invitations");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      "content-type": "application/json",
      cookie: "sid=session-1",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-owner",
      email: "new@example.com",
      role: "member",
    });
  });

  test("invite validates email before calling APIs", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);
    const form = new FormData();
    form.set("email", "");
    form.set("role", "member");

    const result = await mod.actions.invite({
      locals: { session: { userId: "user-owner" }, orgId: "org-1", userId: "user-owner" },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: { headers: { get: () => null }, formData: async () => form },
      url: new URL("http://localhost/settings/users"),
    });

    expect(result).toMatchObject({ status: 400, data: { inviteError: "Email is required." } });
  });

  test("updateRole writes through the organization public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 5}`);
    const form = new FormData();
    form.set("userId", "user-bob");
    form.set("role", "admin");
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.actions.updateRole({
      locals: { session: { userId: "user-owner" }, orgId: "org-1", userId: "user-owner" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json({ ok: true });
      },
      request: { headers: { get: () => "sid=session-1" }, formData: async () => form },
      url: new URL("http://localhost/settings/users"),
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("http://localhost/api/v1/organizations/members/user-bob/role");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-owner",
      role: "admin",
    });
  });

  test("remove deletes through the organization public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 6}`);
    const form = new FormData();
    form.set("userId", "user-bob");
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.actions.remove({
      locals: { session: { userId: "user-owner" }, orgId: "org-1", userId: "user-owner" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json({ ok: true });
      },
      request: { headers: { get: () => "sid=session-1" }, formData: async () => form },
      url: new URL("http://localhost/settings/users"),
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]).toEqual({
      url: "http://localhost/api/v1/organizations/members/user-bob?orgId=org-1&userId=user-owner",
      init: {
        method: "DELETE",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          cookie: "sid=session-1",
        },
        body: undefined,
      },
    });
  });
});
