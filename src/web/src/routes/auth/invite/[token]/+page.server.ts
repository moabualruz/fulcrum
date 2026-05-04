/**
 * Invitation accept page — server load + form action.
 *
 * Routes:
 *   GET  /auth/invite/[token]  — show accept form (or error if token invalid)
 *   POST /auth/invite/[token]  — accept invite (create account if unauthenticated)
 *
 * Pillar 12: invitation accept page.
 * C4: Shared tRPC procedures via /api/trpc fetch calls.
 *
 * Unauthenticated flow:
 *   1. User provides email + name + password.
 *   2. Sign up via Better-Auth (/api/auth/sign-up/email).
 *   3. Call auth.acceptInvite tRPC mutation → creates OrgMember + marks invite accepted.
 *   4. Redirect to dashboard.
 *
 * Authenticated flow:
 *   1. Call auth.acceptInvite tRPC mutation directly (skip account creation).
 *   2. Redirect to dashboard.
 *
 * Error handling: load never throws on invalid token — returns { error } prop.
 */

import { fail, redirect } from "@sveltejs/kit";

// ── Type helpers ──────────────────────────────────────────────────────────────

interface RouteLocals {
  session: unknown;
  orgId: string | null;
  activeProjectId: string | null;
}

interface LoadEvent {
  params: { token: string };
  locals: RouteLocals;
}

interface ActionEvent {
  params: { token: string };
  locals: RouteLocals;
  request: {
    formData(): Promise<FormData>;
    headers: { get(name: string): string | null };
  };
  url: URL;
  fetch: typeof fetch;
}

// ── tRPC fetch helpers ────────────────────────────────────────────────────────

function extractTrpcError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  if (Array.isArray(body)) {
    const first = (body as Array<{ error?: { json?: { message?: string } } }>)[0];
    if (first?.error?.json?.message) return first.error.json.message;
  }
  const b = body as Record<string, unknown>;
  const err = b["error"];
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["message"] === "string") return e["message"];
    const json = e["json"] as Record<string, unknown> | undefined;
    if (json && typeof json["message"] === "string") return json["message"];
  }
  return "Request failed";
}

/**
 * Call a tRPC mutation via server-side fetch.
 */
async function callTrpcMutation(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  input: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({ json: input }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: extractTrpcError(body) };
    }

    const data =
      (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
      (body as { result?: { data?: unknown } })?.result?.data ??
      body;

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function getBaseUrl(requestUrl: string): string {
  const u = new URL(requestUrl);
  return `${u.protocol}//${u.host}`;
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load — returns the token as a prop for the page.
 * Does NOT throw on invalid token — returns error prop instead.
 * Actual validation happens in the form action so we have request context.
 */
export async function load(event: LoadEvent) {
  const { params, locals } = event;
  const token = params.token?.trim() ?? "";
  if (!token) {
    return {
      token: null as string | null,
      error: "Invalid or missing invitation token." as string | null,
      isAuthenticated: false,
    };
  }
  return {
    token,
    error: null as string | null,
    isAuthenticated: !!locals.session,
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export const actions = {
  default: async (event: ActionEvent) => {
    const { params, locals, request, url, fetch: fetchFn } = event;
    const token = params.token?.trim() ?? "";
    if (!token) {
      return fail(400, { error: "Missing invitation token.", token: "" });
    }

    const baseUrl = getBaseUrl(url.href);
    const isAuthenticated = !!locals.session;
    const form = await request.formData();

    if (isAuthenticated) {
      // ── Authenticated path — skip account creation ──────────────────────
      const cookieHeader = request.headers.get("cookie") ?? "";
      const acceptResult = await callTrpcMutation(
        fetchFn,
        baseUrl,
        "auth.acceptInvite",
        { token },
        { cookie: cookieHeader },
      );

      if (!acceptResult.ok) {
        return fail(400, { error: acceptResult.error, token });
      }

      throw redirect(302, "/");
    }

    // ── Unauthenticated path — create account then accept invite ──────────
    const email = String(form.get("email") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "").trim();

    if (!email) {
      return fail(400, { error: "Email is required.", token, email: "", name });
    }
    if (!name) {
      return fail(400, { error: "Name is required.", token, email, name: "" });
    }
    if (!password) {
      return fail(400, { error: "Password is required.", token, email, name });
    }

    // Step 1: Create Better-Auth account.
    const signUpResponse = await fetchFn("/api/auth/sign-up/email", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!signUpResponse.ok) {
      const signUpBody = await signUpResponse.json().catch(() => null);
      const msg = extractTrpcError(signUpBody) || "Could not create account";
      return fail(400, { error: msg, token, email, name });
    }

    // Forward the Set-Cookie header from sign-up so the session is available.
    const setCookie = signUpResponse.headers.get("set-cookie") ?? "";

    // Step 2: Accept the invitation (creates OrgMember row + marks acceptedAt).
    const acceptResult = await callTrpcMutation(
      fetchFn,
      baseUrl,
      "auth.acceptInvite",
      { token, name },
      setCookie ? { cookie: setCookie } : undefined,
    );

    if (!acceptResult.ok) {
      return fail(400, { error: acceptResult.error, token, email, name });
    }

    throw redirect(302, "/");
  },
};
