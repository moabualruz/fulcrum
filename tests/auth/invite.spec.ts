/**
 * tests/auth/invite.spec.ts
 *
 * Unit tests for the invitation-accept page server functions.
 * Tests the +page.server.ts load() and actions.default() logic.
 *
 * RED → GREEN: these tests define the contract the page must honour.
 *
 * Acceptance criteria from issue #12:
 *   1. load() with a valid token returns { token, error: null, isAuthenticated }.
 *   2. load() with empty token returns { token: null, error: <string>, isAuthenticated: false }.
 *   3. load() sets isAuthenticated=true when locals.session is present.
 *   4. actions.default() returns fail(400) when token param is missing.
 *   5. actions.default() returns fail(400) on missing email (unauthenticated path).
 *   6. actions.default() returns fail(400) on missing name (unauthenticated path).
 *   7. actions.default() returns fail(400) on missing password (unauthenticated path).
 *   8. actions.default() calls auth/sign-up/email + auth.acceptInvite on unauthenticated path.
 *   9. actions.default() redirects to / on success (authenticated path).
 *   10. Validated invite token preserved in error return so form can re-render.
 */

import { describe, it, expect } from "bun:test";

// Import the load function and actions from our new page server.
import { load, actions } from "@fulcrum/web/routes/auth/invite/[token]/+page.server.ts";

// ── Helpers ────────────────────────────────────────────────────────────────────

type Locals = { session: object | null; orgId: string | null; activeProjectId: string | null };

function makeLocals(session: object | null = null): Locals {
  return { session, orgId: null, activeProjectId: null };
}

type LoadParams = Parameters<typeof load>[0];

function makeLoadEvent(token: string, session: object | null = null): LoadParams {
  return {
    params: { token },
    locals: makeLocals(session),
  } as unknown as LoadParams;
}

// ── load() tests ──────────────────────────────────────────────────────────────

describe("invite accept +page.server load()", () => {
  it("returns token and null error for a plausible token", async () => {
    const result = await load(makeLoadEvent("abc123def456"));
    expect(result.token).toBe("abc123def456");
    expect(result.error).toBeNull();
    expect(result.isAuthenticated).toBe(false);
  });

  it("returns null token and error string when token param is empty", async () => {
    const result = await load(makeLoadEvent(""));
    expect(result.token).toBeNull();
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
    expect(result.isAuthenticated).toBe(false);
  });

  it("sets isAuthenticated=true when locals.session is present", async () => {
    const mockSession = { id: "sess-01", userId: "user-01" };
    const result = await load(makeLoadEvent("some-token", mockSession));
    expect(result.isAuthenticated).toBe(true);
    expect(result.token).toBe("some-token");
    expect(result.error).toBeNull();
  });

  it("sets isAuthenticated=false when locals.session is null", async () => {
    const result = await load(makeLoadEvent("some-token", null));
    expect(result.isAuthenticated).toBe(false);
  });

  it("trims whitespace from the token", async () => {
    const result = await load(makeLoadEvent("  token-with-spaces  "));
    expect(result.token).toBe("token-with-spaces");
  });
});

// ── actions.default() validation tests ───────────────────────────────────────

describe("invite accept +page.server actions.default() input validation", () => {
  type ActionEvent = Parameters<typeof actions.default>[0];

  /** Loose fetch type for mocks — avoids TypeScript complaint about missing `preconnect`. */
  type MockFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

  function makeActionEvent(opts: {
    token: string;
    formData: Record<string, string>;
    session?: object | null;
    fetchFn?: MockFetch;
  }): ActionEvent {
    const { token, formData, session = null, fetchFn } = opts;

    const fd = new FormData();
    for (const [k, v] of Object.entries(formData)) {
      fd.append(k, v);
    }

    return {
      params: { token },
      locals: makeLocals(session),
      request: {
        formData: async () => fd,
        headers: { get: () => null },
      },
      url: new URL("http://localhost/auth/invite/" + token),
      fetch: (fetchFn ?? (async () => new Response(null, { status: 500 }))) as unknown as typeof fetch,
    } as unknown as ActionEvent;
  }

  it("returns fail(400) when token param is missing", async () => {
    const event = makeActionEvent({ token: "", formData: {} });
    const result = await actions.default(event);
    // SvelteKit fail() returns an object with status + data
    expect(result).toBeDefined();
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toBeTruthy();
  });

  it("returns fail(400) when email is missing (unauthenticated path)", async () => {
    const event = makeActionEvent({
      token: "valid-token",
      formData: { name: "Alice", password: "pass123" },
      session: null,
    });
    const result = await actions.default(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toMatch(/email/i);
  });

  it("returns fail(400) when name is missing (unauthenticated path)", async () => {
    const event = makeActionEvent({
      token: "valid-token",
      formData: { email: "alice@test.local", password: "pass123" },
      session: null,
    });
    const result = await actions.default(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toMatch(/name/i);
  });

  it("returns fail(400) when password is missing (unauthenticated path)", async () => {
    const event = makeActionEvent({
      token: "valid-token",
      formData: { email: "alice@test.local", name: "Alice" },
      session: null,
    });
    const result = await actions.default(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toMatch(/password/i);
  });

  it("returns fail(400) when sign-up fetch fails (unauthenticated path)", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes("/api/auth/sign-up/email")) {
        return new Response(JSON.stringify({ error: "Email already in use" }), { status: 400 });
      }
      return new Response(null, { status: 500 });
    };

    const event = makeActionEvent({
      token: "valid-token",
      formData: { email: "taken@test.local", name: "Alice", password: "pass123" },
      session: null,
      fetchFn: mockFetch,
    });

    const result = await actions.default(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toBeTruthy();
  });

  it("returns fail(400) when acceptInvite tRPC call fails (unauthenticated path)", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes("/api/auth/sign-up/email")) {
        // Sign-up succeeds
        return new Response(JSON.stringify({ user: { id: "u1" } }), {
          status: 200,
          headers: { "set-cookie": "session=tok" },
        });
      }
      if (u.includes("/api/trpc/auth.acceptInvite")) {
        // tRPC fails — invalid token
        return new Response(
          JSON.stringify([{ error: { json: { message: "Invalid token" } } }]),
          { status: 400 },
        );
      }
      return new Response(null, { status: 500 });
    };

    const event = makeActionEvent({
      token: "bad-token",
      formData: { email: "alice@test.local", name: "Alice", password: "pass123" },
      session: null,
      fetchFn: mockFetch,
    });

    const result = await actions.default(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toBeTruthy();
  });

  it("returns fail(400) when authenticated acceptInvite fails", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes("/api/trpc/auth.acceptInvite")) {
        return new Response(
          JSON.stringify([{ error: { json: { message: "Invitation already used" } } }]),
          { status: 400 },
        );
      }
      return new Response(null, { status: 500 });
    };

    const event = makeActionEvent({
      token: "used-token",
      formData: {},
      session: { id: "sess-01", userId: "user-01" },
      fetchFn: mockFetch,
    });

    const result = await actions.default(event);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toMatch(/already used/i);
  });

  it("token value is preserved in fail data for form re-render", async () => {
    const event = makeActionEvent({
      token: "abc-token",
      formData: { email: "alice@test.local" },
      session: null,
    });
    const result = await actions.default(event);
    expect((result as { data: { token: string } }).data.token).toBe("abc-token");
  });
});
