import type { PageServerLoad } from "./$types";
import { createAuditApiClient } from "@workflow-coordination/interface/http/audit-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

interface ProjectActivityEvent {
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

export const load: PageServerLoad = (event) => {
  const projectId = event.params.id;
  const kind = event.url.searchParams.get("kind") ?? undefined;
  const verb = event.url.searchParams.get("verb") ?? undefined;
  const actor = event.url.searchParams.get("actor") ?? undefined;

  return {
    activeProjectId: event.locals?.activeProjectId ?? null,
    projectId,
    filter: { kind, verb, actor },
    streamed: {
      data: (async () => {
        const auditApi = createAuditApiClient({
          baseUrl: publicApiBaseUrl(event.url),
          orgId: activeOrgId(event.locals),
          fetch: event.fetch,
          headers: cookieHeaders(event.request),
        });
        const events = await auditApi.query({
          projectId,
          subjectKind: kind,
          verb,
          userId: actor,
          limit: 20,
        });
        return { events: events.map(normalizeEventRow) };
      })(),
    },
  };
};

function normalizeEventRow(row: unknown): ProjectActivityEvent {
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
