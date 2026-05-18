import { error, type ServerLoad } from "@sveltejs/kit";
import { createAuditApiClient } from "@workflow-coordination/interface/http/audit-api-client";

export interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AuditData {
  events: EventRow[];
  total: number;
  page: number;
  actor: string;
  kind: string;
  verb: string;
  project: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const PAGE_SIZE = 25;

export const load: ServerLoad = async (event) => {
  const filters = auditFilters(event.url);
  const page = auditPage(event.url);
  const auditApi = createAuditApiClient({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });

  try {
    const result = await auditApi.queryPage({
      projectId: filters.project || undefined,
      userId: filters.actor || undefined,
      kind: filters.kind || undefined,
      verb: filters.verb || undefined,
      since: filters.dateFrom || undefined,
      until: filters.dateTo || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });

    return {
      events: result.data.map((row) => normalizeEventRow(row)),
      total: result.total,
      page,
      actor: filters.actor,
      kind: filters.kind,
      verb: filters.verb,
      project: filters.project,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    } satisfies AuditData;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw error(502, message);
  }
};

function auditFilters(url: URL) {
  return {
    actor: (url.searchParams.get("actor") ?? "").trim(),
    kind: (url.searchParams.get("kind") ?? "").trim(),
    verb: (url.searchParams.get("verb") ?? "").trim(),
    project: (url.searchParams.get("project") ?? "").trim(),
    dateFrom: (url.searchParams.get("date_from") ?? "").trim(),
    dateTo: (url.searchParams.get("date_to") ?? "").trim(),
  };
}

function auditPage(url: URL): number {
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
}

function publicApiBaseUrl(url: URL): string {
  return (
    process.env["FULCRUM_SERVER_URL"] ??
    process.env["FULCRUM_PUBLIC_API_URL"] ??
    process.env["FULCRUM_API_URL"] ??
    `${url.protocol}//${url.host}`
  ).replace(/\/+$/, "");
}

function activeOrgId(locals: App.Locals): string {
  const localOrgId = locals.orgId;
  return localOrgId && localOrgId.trim() ? localOrgId : DEFAULT_ORG_ID;
}

function cookieHeaders(request: Request): Record<string, string> {
  const cookie = request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function normalizeEventRow(row: unknown): EventRow {
  const record = isRecord(row) ? row : {};
  return {
    id: stringValue(record, "id"),
    org_id: stringValue(record, "orgId", "org_id"),
    project_id: nullableStringValue(record, "projectId", "project_id"),
    actor: stringValue(record, "userId", "actor") || "system",
    subject_kind: stringValue(record, "subjectKind", "subject_kind"),
    subject_id: stringValue(record, "subjectId", "subject_id"),
    verb: stringValue(record, "verb"),
    payload: isRecord(record["payload"]) ? record["payload"] : {},
    created_at: stringValue(record, "createdAt", "created_at"),
  };
}

function stringValue(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

function nullableStringValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  const value = stringValue(record, ...keys);
  return value ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
