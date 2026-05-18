import { error, fail, redirect } from "@sveltejs/kit";

import { createOrganizationApiCaller } from "@identity-access/interface/http/organization-api-client.ts";
import { createFeatureExperimentApiCaller } from "@feature-flags/interface/http/feature-experiment-api-client.ts";

interface RouteLocals {
  session: unknown;
  orgId?: string;
  userId?: string;
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

export interface FlagRow {
  name: string;
  enabled: boolean;
  description: string;
}

interface FlagApiRow {
  flag?: unknown;
  name?: unknown;
  enabled?: unknown;
  description?: unknown;
}

type ScopedApiCallers = {
  feature: ReturnType<typeof createFeatureExperimentApiCaller>;
  organization: ReturnType<typeof createOrganizationApiCaller>;
};

function getBaseUrl(url: URL): string {
  return process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${url.protocol}//${url.host}`;
}

function createScopedApiCallers(event: LoadEvent | ActionEvent): ScopedApiCallers | null {
  const orgId = event.locals.orgId ?? process.env["FULCRUM_ORG_ID"] ?? "00000000-0000-0000-0000-000000000001";
  const userId = event.locals.userId ?? process.env["FULCRUM_USER_ID"] ?? "local";

  const headers = cookieHeaders(event);
  const baseUrl = getBaseUrl(event.url);
  return {
    feature: createFeatureExperimentApiCaller({
      baseUrl,
      orgId,
      userId,
      fetch: event.fetch,
      headers,
    }),
    organization: createOrganizationApiCaller({
      baseUrl,
      orgId,
      userId,
      fetch: event.fetch,
      headers,
    }),
  };
}

function cookieHeaders(event: LoadEvent | ActionEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function errorStatusFromMessage(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized")) return 401;
  if (lower.includes("403") || lower.includes("forbidden")) return 403;
  return 500;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function requireOwnerOrAdmin(event: LoadEvent | ActionEvent): Promise<ScopedApiCallers> {
  const callers = createScopedApiCallers(event);
  if (!callers) {
    error(503, { message: "Feature flag API caller is not configured." });
  }

  try {
    await callers.organization.orgs.members.list();
    return callers;
  } catch (cause) {
    const message = errorMessage(cause);
    const status = errorStatusFromMessage(message);
    if (status === 401) throw redirect(302, "/auth/login");
    if (status === 403) {
      error(403, { message: "Only org owners and admins can access feature flags." });
    }
    error(500, { message });
  }
}

function normalizeFlagRow(row: FlagApiRow): FlagRow | null {
  const name = typeof row.name === "string"
    ? row.name
    : typeof row.flag === "string"
      ? row.flag
      : "";

  if (!name) return null;

  return {
    name,
    enabled: row.enabled === true,
    description: typeof row.description === "string" ? row.description : "",
  };
}

export async function load(event: LoadEvent) {
  if (!event.locals.session) {
    throw redirect(302, "/auth/login");
  }

  const callers = await requireOwnerOrAdmin(event);

  try {
    const rows = await callers.feature.flags.list();
    const flags = Array.isArray(rows)
      ? rows.map((row) => normalizeFlagRow(row as FlagApiRow)).filter((row): row is FlagRow => row !== null)
      : [];
    return { flags };
  } catch (cause) {
    const message = errorMessage(cause);
    const status = errorStatusFromMessage(message);
    if (status === 401) throw redirect(302, "/auth/login");
    if (status === 403) {
      error(403, { message: "Only org owners and admins can access feature flags." });
    }
    error(500, { message });
  }
}

export const actions = {
  toggle: async (event: ActionEvent) => {
    if (!event.locals.session) {
      throw redirect(302, "/auth/login");
    }

    const form = await event.request.formData();
    const flag = String(form.get("flag") ?? "").trim();
    const enabledValue = String(form.get("enabled") ?? "").trim();

    if (!flag || (enabledValue !== "true" && enabledValue !== "false")) {
      return fail(400, { toggleError: "Flag and enabled state are required." });
    }

    const callers = await requireOwnerOrAdmin(event);

    try {
      await callers.feature.flags.set({ flag, enabled: enabledValue === "true" });
      return { ok: true, flag };
    } catch (cause) {
      const message = errorMessage(cause);
      const status = errorStatusFromMessage(message);
      return fail(status === 403 ? 403 : 400, { toggleError: message, flag });
    }
  },
};
