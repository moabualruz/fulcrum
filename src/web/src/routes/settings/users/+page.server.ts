/**
 * Settings → Users page server — admin user-management UI.
 *
 * Pillar 12: user management (list members, invite, change role, remove).
 *
 * Guard: only owner/admin roles may access this page.
 * Accessible at /settings/users.
 *
 * Procedures used (via /api/trpc):
 *   - orgs.members.list()           (GET query)
 *   - auth.invite(email, role)       (POST mutation — invite action)
 *   - orgs.members.updateRole(...)   (POST mutation — updateRole action)
 *   - orgs.members.remove(...)       (POST mutation — remove action)
 *
 * C4: tRPC is the shared core — all mutations route through /api/trpc.
 * C6: No raw SQL.
 */

import { error, fail, redirect } from "@sveltejs/kit";

// ── Type helpers ──────────────────────────────────────────────────────────────

interface RouteLocals {
  session: unknown;
  orgId: string | null;
  activeProjectId: string | null;
}

interface LoadEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface ActionEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: {
    formData(): Promise<FormData>;
    headers: { get(name: string): string | null };
  };
  url: URL;
}

// ── tRPC fetch helpers ─────────────────────────────────────────────────────────

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

/** Call a tRPC query via GET. */
async function callTrpcQuery(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}?input=%7B%7D`, {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const msg = extractTrpcError(body);
      return { ok: false, error: msg, status: response.status };
    }

    const data =
      (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
      (body as { result?: { data?: unknown } })?.result?.data ??
      body;

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e), status: 500 };
  }
}

async function callTrpcMutation(
  fetchFn: typeof fetch,
  baseUrl: string,
  procedure: string,
  input: unknown,
  cookieHeader: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetchFn(`${baseUrl}/api/trpc/${procedure}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
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

// ── Types ─────────────────────────────────────────────────────────────────────

/** OrgMember row as returned by orgs.members.list. */
export interface MemberRow {
  id: string;
  userId: string;
  orgId: string;
  role: string;
  joinedAt: string;
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function load(event: LoadEvent) {
  const { locals, fetch: fetchFn, request, url } = event;

  // Auth guard — must be signed in.
  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }

  const baseUrl = getBaseUrl(url.href);
  const cookieHeader = request.headers.get("cookie") ?? "";

  const result = await callTrpcQuery(fetchFn, baseUrl, "orgs.members.list", cookieHeader);

  if (!result.ok) {
    // 403 from tRPC → SvelteKit error(403)
    if (result.status === 403) {
      error(403, { message: "Only org owners and admins can access user management." });
    }
    error(500, { message: result.error });
  }

  const members = Array.isArray(result.data) ? (result.data as MemberRow[]) : [];

  return { members };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export const actions = {
  /**
   * invite — generate an invitation token.
   * POST body: email (required), role (optional, default "member").
   */
  invite: async (event: ActionEvent) => {
    const { fetch: fetchFn, request, url } = event;
    const baseUrl = getBaseUrl(url.href);
    const cookieHeader = request.headers.get("cookie") ?? "";
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role") ?? "member").trim();

    if (!email) {
      return fail(400, { inviteError: "Email is required." });
    }

    const result = await callTrpcMutation(fetchFn, baseUrl, "auth.invite", { email, role }, cookieHeader);

    if (!result.ok) {
      return fail(400, { inviteError: result.error });
    }

    const data = result.data as { token?: string; invitationId?: string } | null;
    return { inviteToken: data?.token ?? null, inviteEmail: email };
  },

  /**
   * updateRole — change a member's role.
   * POST body: userId (required), role (required).
   */
  updateRole: async (event: ActionEvent) => {
    const { fetch: fetchFn, request, url } = event;
    const baseUrl = getBaseUrl(url.href);
    const cookieHeader = request.headers.get("cookie") ?? "";
    const form = await request.formData();
    const userId = String(form.get("userId") ?? "").trim();
    const role = String(form.get("role") ?? "").trim();

    if (!userId || !role) {
      return fail(400, { roleError: "userId and role are required." });
    }

    const result = await callTrpcMutation(
      fetchFn,
      baseUrl,
      "orgs.members.updateRole",
      { userId, role },
      cookieHeader,
    );

    if (!result.ok) {
      return fail(400, { roleError: result.error });
    }

    return { ok: true };
  },

  /**
   * remove — remove a member from the org.
   * POST body: userId (required).
   */
  remove: async (event: ActionEvent) => {
    const { fetch: fetchFn, request, url } = event;
    const baseUrl = getBaseUrl(url.href);
    const cookieHeader = request.headers.get("cookie") ?? "";
    const form = await request.formData();
    const userId = String(form.get("userId") ?? "").trim();

    if (!userId) {
      return fail(400, { removeError: "userId is required." });
    }

    const result = await callTrpcMutation(
      fetchFn,
      baseUrl,
      "orgs.members.remove",
      { userId },
      cookieHeader,
    );

    if (!result.ok) {
      return fail(400, { removeError: result.error });
    }

    return { ok: true };
  },
};
