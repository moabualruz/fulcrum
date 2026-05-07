import type { RequestHandler } from "./$types";
import { eventsToCsv, eventsToJson, queryAuditEventRows } from "../../../../../application/audit/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const GET: RequestHandler = async ({ url, locals }) => {
  const format = url.searchParams.get("format") ?? "csv";
  const kind = (url.searchParams.get("kind") ?? "").trim() || undefined;
  const verb = (url.searchParams.get("verb") ?? "").trim() || undefined;
  const actor = (url.searchParams.get("actor") ?? "").trim() || undefined;
  const project = (url.searchParams.get("project") ?? "").trim() || undefined;
  const since = (url.searchParams.get("since") ?? "").trim() || undefined;
  const until = (url.searchParams.get("until") ?? "").trim() || undefined;

  const { em, ctx } = await requestAppScope(locals, project ?? null);
  const result = await queryAuditEventRows(em, ctx, {
    subjectKind: kind,
    verb,
    actor,
    projectId: project,
    since,
    until,
    limit: 100_000,
    offset: 0,
  });

  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const body = eventsToJson(result.rows);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="audit-${dateStr}.json"`,
      },
    });
  }

  const body = eventsToCsv(result.rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="audit-${dateStr}.csv"`,
    },
  });
};
