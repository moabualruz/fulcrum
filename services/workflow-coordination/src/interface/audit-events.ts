export type {
  AuditFilter,
  AuditQueryResult,
  EventRow,
  RetentionPolicyRow,
} from "@workflow-coordination/application/audit/web-queries.ts";

type EventRow = import("@workflow-coordination/application/audit/web-queries.ts").EventRow;
type GetRetentionPolicy = typeof import("@workflow-coordination/application/audit/web-queries.ts").getRetentionPolicy;
type QueryAuditEvents = typeof import("@workflow-coordination/application/audit/web-queries.ts").queryAuditEvents;
type UpsertRetentionPolicy = typeof import("@workflow-coordination/application/audit/web-queries.ts").upsertRetentionPolicy;

export async function queryAuditEvents(
  ...args: Parameters<QueryAuditEvents>
): Promise<Awaited<ReturnType<QueryAuditEvents>>> {
  const queries = await import("@workflow-coordination/application/audit/web-queries.ts");
  return queries.queryAuditEvents(...args);
}

export function eventsToCsv(events: EventRow[]): string {
  const headers = ["id", "org_id", "project_id", "actor", "subject_kind", "subject_id", "verb", "payload", "created_at"];
  const lines = [headers.join(",")];
  for (const event of events) {
    const row = [
      event.id,
      event.org_id,
      event.project_id ?? "",
      event.actor,
      event.subject_kind,
      event.subject_id,
      event.verb,
      `"${JSON.stringify(event.payload ?? {}).replace(/"/g, '""')}"`,
      event.created_at,
    ];
    lines.push(row.join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function eventsToJson(events: EventRow[]): string {
  return JSON.stringify(events);
}

export async function getRetentionPolicy(
  ...args: Parameters<GetRetentionPolicy>
): Promise<Awaited<ReturnType<GetRetentionPolicy>>> {
  const queries = await import("@workflow-coordination/application/audit/web-queries.ts");
  return queries.getRetentionPolicy(...args);
}

export async function upsertRetentionPolicy(
  ...args: Parameters<UpsertRetentionPolicy>
): Promise<Awaited<ReturnType<UpsertRetentionPolicy>>> {
  const queries = await import("@workflow-coordination/application/audit/web-queries.ts");
  return queries.upsertRetentionPolicy(...args);
}
