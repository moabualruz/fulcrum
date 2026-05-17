import { fail, type Actions, type ServerLoad } from "@sveltejs/kit";
import { AppError } from "@platform-core/domain/errors.ts";
import { createErrorLogApiForEvent } from "$lib/server/error-log-api";

const PAGE_SIZE = 20;

function appFail(error: unknown) {
  if (error instanceof AppError) return fail(error.kind === "validation" ? 400 : 500, { error: error.message });
  if (error instanceof Error) return fail(500, { error: error.message });
  throw error;
}

type ErrorLogApiRow = {
  id?: unknown;
  errorMessage?: unknown;
  stackTrace?: unknown;
  context?: unknown;
  os?: unknown;
  fulcrumVersion?: unknown;
  bunVersion?: unknown;
  occurredAt?: unknown;
};

type ErrorLogPageResponse = {
  data?: unknown;
  total?: unknown;
};

export const load: ServerLoad = ({ url, locals, fetch, request }) => {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  return {
    page,
    streamed: {
      data: (async () => {
        const errorLogs = createErrorLogApiForEvent({ url, locals, fetch, request }).errorLogs;
        const response = await errorLogs.listPage({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });
        const payload = normalizePageResponse(response);
        return {
          errors: payload.rows.map(toSettingsError),
          total: payload.total,
          page,
          pageSize: PAGE_SIZE,
        };
      })(),
    },
  };
};

export const actions: Actions = {
  clearBefore: async ({ request, locals, fetch, url }) => {
    const data = await request.formData();
    const before = data.get("before") as string;
    if (!before) return fail(400, { error: "before date required" });
    try {
      await createErrorLogApiForEvent({ url, locals, fetch, request }).errorLogs.clear({ before });
      return { success: true as const };
    } catch (error) {
      return appFail(error);
    }
  },
};

function normalizePageResponse(response: unknown): { rows: ErrorLogApiRow[]; total: number } {
  const page = response && typeof response === "object" ? response as ErrorLogPageResponse : {};
  const rows = Array.isArray(page.data) ? page.data as ErrorLogApiRow[] : Array.isArray(response) ? response as ErrorLogApiRow[] : [];
  const total = typeof page.total === "number" ? page.total : rows.length;
  return { rows, total };
}

function toSettingsError(row: ErrorLogApiRow) {
  const version = stringOrNull(row.fulcrumVersion) ?? stringOrNull(row.bunVersion);
  return {
    id: stringOrFallback(row.id, ""),
    message: stringOrFallback(row.errorMessage, ""),
    stack_trace: stringOrNull(row.stackTrace),
    context: recordOrEmpty(row.context),
    os: stringOrNull(row.os),
    version,
    occurred_at: stringOrFallback(row.occurredAt, new Date(0).toISOString()),
  };
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
