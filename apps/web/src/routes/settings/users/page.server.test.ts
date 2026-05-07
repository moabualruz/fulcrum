import { describe, expect, test } from "bun:test";

// Tests for +page.server.ts load() and actions.
// We test the auth-guard redirect and the data-shaping logic by providing
// a controlled fetch mock, avoiding a live tRPC server.

type LoadResult = { members: unknown[] };

interface FakeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

function fakeOkFetch(data: unknown): typeof fetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: { json: data } } }),
    } as FakeResponse as Response);
}

function fakeFail(status: number, msg: string): typeof fetch {
  return async () =>
    ({
      ok: false,
      status,
      json: async () => ({ error: { json: { message: msg } } }),
    } as FakeResponse as Response);
}

describe("/settings/users +page.server.ts load()", () => {
  test("redirects to /auth/login when no session", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let threw = false;
    try {
      await mod.load({
        locals: { session: null },
        fetch: fakeOkFetch([]),
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/users"),
      });
    } catch (e) {
      threw = true;
      const err = e as { status?: number; location?: string };
      expect(err.status).toBe(302);
      expect(err.location).toBe("/auth/login");
    }
    expect(threw).toBe(true);
  });

  test("returns members list from tRPC", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const fakeMembers = [
      { id: "m1", userId: "user-alice", orgId: "org-001", role: "owner", joinedAt: "2024-01-01T00:00:00Z" },
    ];
    const result: LoadResult = await mod.load({
      locals: { session: { userId: "user-alice" } },
      fetch: fakeOkFetch(fakeMembers),
      request: { headers: { get: () => null } },
      url: new URL("http://localhost/settings/users"),
    });
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.members).toHaveLength(1);
    expect((result.members[0] as { userId: string }).userId).toBe("user-alice");
  });

  test("returns empty array when tRPC returns null", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    const result: LoadResult = await mod.load({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch(null),
      request: { headers: { get: () => null } },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result.members).toEqual([]);
  });
});

describe("/settings/users +page.server.ts actions.invite()", () => {
  test("returns fail(400) when email is empty", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("email", "");
    fd.set("role", "member");
    const result = await mod.actions.invite({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch({}),
      request: { headers: { get: () => null }, formData: async () => fd },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result).toMatchObject({ data: { inviteError: expect.any(String) } });
  });

  test("returns token on success", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);
    const fd = new FormData();
    fd.set("email", "new@example.com");
    fd.set("role", "member");
    const result = await mod.actions.invite({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch({ token: "tok-xyz", invitationId: "inv-1" }),
      request: { headers: { get: () => null }, formData: async () => fd },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result).toMatchObject({ inviteToken: "tok-xyz", inviteEmail: "new@example.com" });
  });
});

describe("/settings/users +page.server.ts actions.updateRole()", () => {
  test("returns fail when userId or role missing", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 5}`);
    const fd = new FormData();
    fd.set("userId", "");
    fd.set("role", "admin");
    const result = await mod.actions.updateRole({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch({}),
      request: { headers: { get: () => null }, formData: async () => fd },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result).toMatchObject({ data: { roleError: expect.any(String) } });
  });

  test("returns ok=true on success", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 6}`);
    const fd = new FormData();
    fd.set("userId", "user-bob");
    fd.set("role", "admin");
    const result = await mod.actions.updateRole({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("/settings/users +page.server.ts actions.remove()", () => {
  test("returns fail when userId missing", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 7}`);
    const fd = new FormData();
    fd.set("userId", "");
    const result = await mod.actions.remove({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch({}),
      request: { headers: { get: () => null }, formData: async () => fd },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result).toMatchObject({ data: { removeError: expect.any(String) } });
  });

  test("returns ok=true on success", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 8}`);
    const fd = new FormData();
    fd.set("userId", "user-bob");
    const result = await mod.actions.remove({
      locals: { session: { userId: "u1" } },
      fetch: fakeOkFetch({ ok: true }),
      request: { headers: { get: () => null }, formData: async () => fd },
      url: new URL("http://localhost/settings/users"),
    });
    expect(result).toMatchObject({ ok: true });
  });
});
