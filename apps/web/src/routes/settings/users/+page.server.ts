import { error, fail, redirect } from "@sveltejs/kit";

import { createInvitationApiCaller } from "@identity-access/interface/http/invitation-api-client.ts";
import { createOrganizationApiCaller } from "@identity-access/interface/http/organization-api-client.ts";

interface RouteLocals {
  session: unknown;
  orgId?: string | null;
  userId?: string | null;
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

export interface MemberRow {
  id: string;
  userId: string;
  orgId: string;
  role: string;
  joinedAt: string;
}

interface MemberApiRow {
  id?: unknown;
  userId?: unknown;
  orgId?: unknown;
  role?: unknown;
  joinedAt?: unknown;
}

type ScopedApiCallers = {
  invitations: ReturnType<typeof createInvitationApiCaller>["invitations"];
  organizations: ReturnType<typeof createOrganizationApiCaller>["orgs"];
};

function getBaseUrl(url: URL): string {
  return process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${url.protocol}//${url.host}`;
}

function scopedIdentity(locals: RouteLocals): { orgId: string; userId: string } | null {
  const orgId = locals.orgId;
  const userId = locals.userId ?? (locals.session as { userId?: string } | null)?.userId;
  if (!orgId || !userId) return null;
  return { orgId, userId };
}

function createScopedApiCallers(event: LoadEvent | ActionEvent): ScopedApiCallers | null {
  const identity = scopedIdentity(event.locals);
  if (!identity) return null;

  const options = {
    baseUrl: getBaseUrl(event.url),
    orgId: identity.orgId,
    userId: identity.userId,
    fetch: event.fetch,
    headers: cookieHeaders(event),
  };

  return {
    invitations: createInvitationApiCaller(options).invitations,
    organizations: createOrganizationApiCaller(options).orgs,
  };
}

function cookieHeaders(event: LoadEvent | ActionEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function statusFromMessage(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized")) return 401;
  if (lower.includes("403") || lower.includes("forbidden")) return 403;
  return 500;
}

function requireApiCallers(event: LoadEvent | ActionEvent): ScopedApiCallers {
  const callers = createScopedApiCallers(event);
  if (!callers) {
    error(503, { message: "User management API caller is not configured." });
  }
  return callers;
}

function actionFailure(cause: unknown, key: "inviteError" | "roleError" | "removeError") {
  const message = errorMessage(cause);
  const status = statusFromMessage(message);
  return fail(status === 403 ? 403 : 400, { [key]: message });
}

function normalizeMember(row: MemberApiRow): MemberRow | null {
  if (typeof row.userId !== "string" || typeof row.orgId !== "string") return null;
  return {
    id: typeof row.id === "string" ? row.id : `${row.orgId}:${row.userId}`,
    userId: row.userId,
    orgId: row.orgId,
    role: typeof row.role === "string" ? row.role : "member",
    joinedAt: typeof row.joinedAt === "string" ? row.joinedAt : "",
  };
}

export async function load(event: LoadEvent) {
  if (!event.locals.session) {
    throw redirect(302, "/auth/login");
  }

  const callers = requireApiCallers(event);

  try {
    const rows = await callers.organizations.members.list();
    const members = Array.isArray(rows)
      ? rows.map((row) => normalizeMember(row as MemberApiRow)).filter((row): row is MemberRow => row !== null)
      : [];
    return { members };
  } catch (cause) {
    const message = errorMessage(cause);
    const status = statusFromMessage(message);
    if (status === 401) throw redirect(302, "/auth/login");
    if (status === 403) {
      error(403, { message: "Only org owners and admins can access user management." });
    }
    error(500, { message });
  }
}

export const actions = {
  invite: async (event: ActionEvent) => {
    if (!event.locals.session) {
      throw redirect(302, "/auth/login");
    }

    const form = await event.request.formData();
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role") ?? "member").trim();

    if (!email) {
      return fail(400, { inviteError: "Email is required." });
    }

    try {
      const callers = requireApiCallers(event);
      const invitation = await callers.invitations.create({ email, role });
      const data = invitation as { token?: string } | null;
      return { inviteToken: data?.token ?? null, inviteEmail: email };
    } catch (cause) {
      return actionFailure(cause, "inviteError");
    }
  },

  updateRole: async (event: ActionEvent) => {
    if (!event.locals.session) {
      throw redirect(302, "/auth/login");
    }

    const form = await event.request.formData();
    const userId = String(form.get("userId") ?? "").trim();
    const role = String(form.get("role") ?? "").trim();

    if (!userId || !role) {
      return fail(400, { roleError: "userId and role are required." });
    }

    try {
      const callers = requireApiCallers(event);
      await callers.organizations.members.updateRole({ userId, role });
      return { ok: true };
    } catch (cause) {
      return actionFailure(cause, "roleError");
    }
  },

  remove: async (event: ActionEvent) => {
    if (!event.locals.session) {
      throw redirect(302, "/auth/login");
    }

    const form = await event.request.formData();
    const userId = String(form.get("userId") ?? "").trim();

    if (!userId) {
      return fail(400, { removeError: "userId is required." });
    }

    try {
      const callers = requireApiCallers(event);
      await callers.organizations.members.remove({ userId });
      return { ok: true };
    } catch (cause) {
      return actionFailure(cause, "removeError");
    }
  },
};
