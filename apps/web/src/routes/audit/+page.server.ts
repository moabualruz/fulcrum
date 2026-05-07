import type { ServerLoad } from "@sveltejs/kit";
import { queryAuditEventRows } from "@/application/audit/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

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

export const load: ServerLoad = async ({ url, locals }) => {
  const actor = (url.searchParams.get("actor") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const verb = (url.searchParams.get("verb") ?? "").trim();
  const project = (url.searchParams.get("project") ?? "").trim();
  const dateFrom = (url.searchParams.get("date_from") ?? "").trim();
  const dateTo = (url.searchParams.get("date_to") ?? "").trim();
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;

  const { em, ctx } = await requestAppScope(locals, project || null);
  const result = await queryAuditEventRows(em, ctx, {
    subjectKind: kind || undefined,
    verb: verb || undefined,
    actor: actor || undefined,
    projectId: project || undefined,
    since: dateFrom || undefined,
    until: dateTo || undefined,
    limit: 50,
    offset: (page - 1) * 50,
  });
  const events = result.rows;

  return { events, total: result.total, page, actor, kind, verb, project, dateFrom, dateTo } satisfies AuditData;
};
