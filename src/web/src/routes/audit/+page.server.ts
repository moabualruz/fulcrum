import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { queryAuditEvents } from "$lib/server/audit";

export const load: PageServerLoad = ({ url }) => {
  const kind = (url.searchParams.get("kind") ?? "").trim() || undefined;
  const verb = (url.searchParams.get("verb") ?? "").trim() || undefined;
  const actor = (url.searchParams.get("actor") ?? "").trim() || undefined;
  const project = (url.searchParams.get("project") ?? "").trim() || undefined;
  const since = (url.searchParams.get("since") ?? "").trim() || undefined;
  const until = (url.searchParams.get("until") ?? "").trim() || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = 50;

  const filter = { kind: kind ?? "", verb: verb ?? "", actor: actor ?? "", project: project ?? "", since: since ?? "", until: until ?? "" };

  return {
    filter,
    page,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const result = await queryAuditEvents(
            db,
            {
              orgId,
              subjectKind: kind,
              verb,
              actor,
              projectId: project,
              since,
              until,
            },
            { limit, offset: (page - 1) * limit },
          );
          return { events: result.rows, total: result.total };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
