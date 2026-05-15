/**
 * Unit tests for the settings/users page server functions.
 * Tests the +page.server.ts load() and actions (invite, updateRole, remove).
 *
 * Acceptance criteria:
 *   1. load() redirects unauthenticated visitors to /auth/login (303).
 *   2. load() returns members array when tRPC orgs.members.list succeeds.
 *   3. load() surfaces 403 error when tRPC returns FORBIDDEN.
 *   4. actions.invite returns fail(400) when email is missing.
 *   5. actions.invite returns { inviteToken, inviteEmail } on success.
 *   6. actions.invite returns fail(400) on tRPC error.
 *   7. actions.updateRole returns fail(400) when userId or role is missing.
 *   8. actions.updateRole returns { ok: true } on success.
 *   9. actions.remove returns fail(400) when userId is missing.
 *   10. actions.remove returns fail(400) when tRPC returns BAD_REQUEST (last owner).
 *   11. actions.remove returns { ok: true } on success.
 */

import { describe, it, expect } from "bun:test";

import {
  load,
  actions,
} from "@fulcrum/web/routes/settings/users/+page.server.ts";

// ── Helpers ────────────────────────────────────────────────────────────────────

type Locals = { session: object | null; orgId: string | null; activeProjectId: string | null };

/** Loose fetch type for mocks — avoids TypeScript complaint about missing `preconnect`. */
type MockFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function makeLocals(session: object | null = null): Locals {
  return { session, orgId: session ? "org-01" : null, activeProjectId: null };
}

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<typeof actions.invite>[0];

function makeLoadEvent(opts: {
  session?: object | null;
  fetchFn?: MockFetch;
}): LoadEvent {
  const { session = null, fetchFn } = opts;

  return {
    locals: makeLocals(session),
    fetch: (fetchFn ?? (async () => new Response(null, { status: 500 }))) as unknown as typeof fetch,
    request: { headers: { get: () => null } },
    url: new URL("http://localhost/settings/users"),
  } as unknown as LoadEvent;
}

function makeActionEvent(opts: {
  formData: Record<string, string>;
  fetchFn?: MockFetch;
  session?: object | null;
}): ActionEvent {
  const { formData, fetchFn, session = { id: "sess", userId: "u1" } } = opts;

  const fd = new FormData();
  for (const [k, v] of Object.entries(formData)) {
    fd.append(k, v);
  }

  return {
    locals: makeLocals(session),
    fetch: (fetchFn ?? (async () => new Response(null, { status: 500 }))) as unknown as typeof fetch,
    request: {
      formData: async () => fd,
      headers: { get: () => null },
    },
    url: new URL("http://localhost/settings/users"),
  } as unknown as ActionEvent;
}

const MOCK_MEMBERS = [
  { id: "mem-1", userId: "u-1", orgId: "org-1", role: "owner", joinedAt: new Date().toISOString() },
  { id: "mem-2", userId: "u-2", orgId: "org-1", role: "member", joinedAt: new Date().toISOString() },
];

// ── load() tests ──────────────────────────────────────────────────────────────

describe("settings/users +page.server load()", () => {
  it("redirects unauthenticated visitor to /auth/login", async () => {
    const event = makeLoadEvent({ session: null });
    let threw: unknown = null;
    try {
      await load(event);
    } catch (e) {
      threw = e;
    }
    // SvelteKit redirect throws an object with status + location
    expect(threw).not.toBeNull();
    const err = threw as { status: number; location: string };
    expect(err.status).toBe(302);
    expect(err.location).toBe("/auth/login");
  });

  it("returns members array when orgs.members.list succeeds", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes("/api/trpc/orgs.members.list")) {
        return new Response(
          JSON.stringify({ result: { data: { json: MOCK_MEMBERS } } }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    const event = makeLoadEvent({
      session: { id: "sess", userId: "u1" },
      fetchFn: mockFetch,
    });

    const result = await load(event);
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.members).toHaveLength(2);
    expect(result.members[0]?.userId).toBe("u-1");
    expect(result.members[1]?.role).toBe("member");
  });

  it("surfaces 403 error when tRPC returns FORBIDDEN", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify([{ error: { json: { message: "Only org owners and admins can perform this action." } } }]),
        { status: 403 },
      );

    const event = makeLoadEvent({
      session: { id: "sess", userId: "u1" },
      fetchFn: mockFetch,
    });

    let threw: unknown = null;
    try {
      await load(event);
    } catch (e) {
      threw = e;
    }
    // SvelteKit error() throws an HttpError
    expect(threw).not.toBeNull();
    const err = threw as { status: number; body?: { message?: string } };
    expect(err.status).toBe(403);
  });

  it("returns empty members array when list returns empty", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes("/api/trpc/orgs.members.list")) {
        return new Response(
          JSON.stringify({ result: { data: { json: [] } } }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    const event = makeLoadEvent({
      session: { id: "sess", userId: "u1" },
      fetchFn: mockFetch,
    });

    const result = await load(event);
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.members).toHaveLength(0);
  });
});

// ── actions.invite tests ──────────────────────────────────────────────────────

describe("settings/users +page.server actions.invite", () => {
  it("returns fail(400) when email is missing", async () => {
    const event = makeActionEvent({ formData: { role: "member" } });
    const result = await actions.invite(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { inviteError: string } }).data.inviteError).toMatch(/email/i);
  });

  it("returns fail(400) on tRPC error", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify([{ error: { json: { message: "Only org owners and admins can invite members." } } }]),
        { status: 403 },
      );

    const event = makeActionEvent({
      formData: { email: "new@test.local", role: "member" },
      fetchFn: mockFetch,
    });

    const result = await actions.invite(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { inviteError: string } }).data.inviteError).toBeTruthy();
  });

  it("returns inviteToken and inviteEmail on success", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes("/api/trpc/auth.invite")) {
        return new Response(
          JSON.stringify({
            result: {
              data: {
                json: {
                  invitationId: "inv-uuid-01",
                  token: "plaintext-token-abcdef1234567890",
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    const event = makeActionEvent({
      formData: { email: "new@test.local", role: "member" },
      fetchFn: mockFetch,
    });

    const result = await actions.invite(event);
    const data = result as { inviteToken: string; inviteEmail: string };
    expect(data.inviteToken).toBe("plaintext-token-abcdef1234567890");
    expect(data.inviteEmail).toBe("new@test.local");
  });
});

// ── actions.updateRole tests ──────────────────────────────────────────────────

describe("settings/users +page.server actions.updateRole", () => {
  it("returns fail(400) when userId is missing", async () => {
    const event = makeActionEvent({ formData: { role: "admin" } });
    const result = await actions.updateRole(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { roleError: string } }).data.roleError).toBeTruthy();
  });

  it("returns fail(400) when role is missing", async () => {
    const event = makeActionEvent({ formData: { userId: "46c4857c-7293-4e1d-a85b-51953a20b198" } });
    const result = await actions.updateRole(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { roleError: string } }).data.roleError).toBeTruthy();
  });

  it("returns fail(400) on tRPC FORBIDDEN error", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify([{ error: { json: { message: "Only org owners can perform this action." } } }]),
        { status: 403 },
      );

    const event = makeActionEvent({
      formData: { userId: "46c4857c-7293-4e1d-a85b-51953a20b198", role: "admin" },
      fetchFn: mockFetch,
    });

    const result = await actions.updateRole(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { roleError: string } }).data.roleError).toBeTruthy();
  });

  it("returns { ok: true } on success", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes("/api/trpc/orgs.members.updateRole")) {
        return new Response(
          JSON.stringify({ result: { data: { json: { ok: true } } } }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    const event = makeActionEvent({
      formData: { userId: "46c4857c-7293-4e1d-a85b-51953a20b198", role: "admin" },
      fetchFn: mockFetch,
    });

    const result = await actions.updateRole(event);
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});

// ── actions.remove tests ──────────────────────────────────────────────────────

describe("settings/users +page.server actions.remove", () => {
  it("returns fail(400) when userId is missing", async () => {
    const event = makeActionEvent({ formData: {} });
    const result = await actions.remove(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { removeError: string } }).data.removeError).toBeTruthy();
  });

  it("returns fail(400) when tRPC returns BAD_REQUEST (last owner)", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify([{ error: { json: { message: "Cannot remove the last owner of an org." } } }]),
        { status: 400 },
      );

    const event = makeActionEvent({
      formData: { userId: "46c4857c-7293-4e1d-a85b-51953a20b198" },
      fetchFn: mockFetch,
    });

    const result = await actions.remove(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { removeError: string } }).data.removeError).toMatch(/last owner/i);
  });

  it("returns { ok: true } on success", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes("/api/trpc/orgs.members.remove")) {
        return new Response(
          JSON.stringify({ result: { data: { json: { ok: true } } } }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    const event = makeActionEvent({
      formData: { userId: "46c4857c-7293-4e1d-a85b-51953a20b198" },
      fetchFn: mockFetch,
    });

    const result = await actions.remove(event);
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});
