import type { ServerLoad } from "@sveltejs/kit";
import { queryAuditEvents } from "../../../../application/audit/queries.ts";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

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

  const em = locals.em ?? await getEm();
  const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
  const result = await queryAuditEvents(em, { orgId, userId: null, projectId: project || null }, {
    subjectKind: kind || undefined,
  });
  const events = result.items
    .filter((event) => !project || event.projectId === project)
    .filter((event) => !verb || event.action === verb)
    .map((event) => ({
      id: event.id,
      org_id: event.orgId,
      project_id: event.projectId,
      actor: actor || "system",
      subject_kind: event.subjectKind,
      subject_id: event.subjectId,
      verb: event.action,
      payload: {},
      created_at: new Date().toISOString(),
    }));

  return { events, total: events.length, page, actor, kind, verb, project, dateFrom, dateTo } satisfies AuditData;
};
