import { fail, type Actions, type ServerLoad } from "@sveltejs/kit";
import { createTelemetryApiCaller } from "@platform-core/interface/http/telemetry-api-client";

interface TelemetryEvent {
  locals: App.Locals;
  fetch: typeof fetch;
  request: Request;
  url: URL;
}

interface TelemetryStatus {
  optIn: boolean;
  rowCount: number;
}

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_USER_ID = "local-user";

export const load: ServerLoad = (event) => {
  return {
    streamed: {
      data: loadTelemetry(event as TelemetryEvent),
    },
  };
};

export const actions: Actions = {
  toggleOptIn: async (event) => {
    try {
      const caller = telemetryCaller(event as TelemetryEvent);
      const status = normalizeStatus(await caller.telemetry.status());
      if (status.optIn) {
        await caller.telemetry.optOut();
      } else {
        await caller.telemetry.optIn();
      }
      return { success: true, optIn: !status.optIn };
    } catch (cause) {
      return fail(502, { error: errorMessage(cause) });
    }
  },

  purge: async (event) => {
    try {
      const result = await telemetryCaller(event as TelemetryEvent).telemetry.purge();
      return { success: true, rowCount: deletedRowCount(result) };
    } catch (cause) {
      return fail(502, { error: errorMessage(cause) });
    }
  },
};

async function loadTelemetry(event: TelemetryEvent): Promise<TelemetryStatus> {
  return normalizeStatus(await telemetryCaller(event).telemetry.status());
}

function telemetryCaller(event: TelemetryEvent) {
  return createTelemetryApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    userId: activeUserId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}

function publicApiBaseUrl(url: URL): string {
  return (
    process.env["FULCRUM_SERVER_URL"] ??
    process.env["FULCRUM_PUBLIC_API_URL"] ??
    `${url.protocol}//${url.host}`
  ).replace(/\/+$/, "");
}

function activeOrgId(locals: App.Locals): string {
  const localOrgId = locals.orgId;
  return localOrgId && localOrgId.trim() ? localOrgId : DEFAULT_ORG_ID;
}

function activeUserId(locals: App.Locals): string {
  const localUserId = locals.userId ?? sessionUserId(locals.session);
  return localUserId && localUserId.trim() ? localUserId : DEFAULT_USER_ID;
}

function sessionUserId(session: unknown): string | null {
  if (!isRecord(session)) return null;
  const userId = session["userId"];
  return typeof userId === "string" ? userId : null;
}

function cookieHeaders(request: Request): Record<string, string> {
  const cookie = request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function normalizeStatus(value: unknown): TelemetryStatus {
  const record = isRecord(value) ? value : {};
  return {
    optIn: Boolean(record["optIn"] ?? record["opted_in"]),
    rowCount: numberValue(record["rowCount"] ?? record["row_count"]),
  };
}

function deletedRowCount(value: unknown): number {
  const record = isRecord(value) ? value : {};
  return numberValue(record["deleted"] ?? record["rowCount"] ?? record["row_count"]);
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
