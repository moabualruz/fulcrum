import type { RequestHandler } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { queryAuditEvents, eventsToCsv, eventsToJson } from "$lib/server/audit";

export const GET: RequestHandler = async ({ url }) => {
  const format = url.searchParams.get("format") ?? "csv";
  const kind = (url.searchParams.get("kind") ?? "").trim() || undefined;
  const verb = (url.searchParams.get("verb") ?? "").trim() || undefined;
  const actor = (url.searchParams.get("actor") ?? "").trim() || undefined;
  const project = (url.searchParams.get("project") ?? "").trim() || undefined;
  const since = (url.searchParams.get("since") ?? "").trim() || undefined;
  const until = (url.searchParams.get("until") ?? "").trim() || undefined;

  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    // Export up to 100k rows; beyond that would need a job
    const result = await queryAuditEvents(
      db,
      { orgId, subjectKind: kind, verb, actor, projectId: project, since, until },
      { limit: 100_000, offset: 0 },
    );

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

    // Default: CSV
    const body = eventsToCsv(result.rows);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-${dateStr}.csv"`,
      },
    });
  } finally {
    await db.close();
  }
};
