import type { ServerLoad } from "@sveltejs/kit";
import { openProductDb } from "$lib/server/db";
import type { EventRow } from "../../../../product-kernel/store/repositories.ts";

export type { EventRow };

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

const PAGE_SIZE = 25;

export const load: ServerLoad = async ({ url }) => {
  const actor = (url.searchParams.get("actor") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const verb = (url.searchParams.get("verb") ?? "").trim();
  const project = (url.searchParams.get("project") ?? "").trim();
  const dateFrom = (url.searchParams.get("date_from") ?? "").trim();
  const dateTo = (url.searchParams.get("date_to") ?? "").trim();
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  const offset = (page - 1) * PAGE_SIZE;

  const db = await openProductDb();
  try {
    const orgRows = await db.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = $1`, ["default"]);
    const orgId = orgRows[0]?.id;
    if (!orgId) return { events: [], total: 0, page, actor, kind, verb, project, dateFrom, dateTo } satisfies AuditData;

    const params: (string | number)[] = [orgId];
    const conditions: string[] = ["org_id = $1"];

    if (actor) {
      params.push(actor);
      conditions.push(`actor = $${params.length}`);
    }
    if (kind) {
      params.push(kind);
      conditions.push(`subject_kind = $${params.length}`);
    }
    if (verb) {
      params.push(verb);
      conditions.push(`verb = $${params.length}`);
    }
    if (project) {
      params.push(project);
      conditions.push(`project_id = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      const ceiling = dateTo.length === 10 ? `${dateTo}T23:59:59Z` : dateTo;
      params.push(ceiling);
      conditions.push(`created_at <= $${params.length}::timestamptz`);
    }

    const where = conditions.join(" AND ");

    const countRows = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM events WHERE ${where}`,
      params as never,
    );
    const total = parseInt(countRows[0]?.count ?? "0", 10);

    const pageParams = [...params, PAGE_SIZE, offset];
    const events = await db.query<EventRow>(
      `SELECT id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at
         FROM events
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams as never,
    );

    return { events, total, page, actor, kind, verb, project, dateFrom, dateTo } satisfies AuditData;
  } finally {
    await db.close();
  }
};
