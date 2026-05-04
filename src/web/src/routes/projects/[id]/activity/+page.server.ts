import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { getDefaultOrgId } from "$lib/server/db";
import { listEventsFiltered } from "@fulcrum/product-kernel/store/repositories.ts";

export const load: PageServerLoad = ({ params, url, locals }) => {
  const projectId = params.id;
  const kind = url.searchParams.get("kind") ?? undefined;
  const verb = url.searchParams.get("verb") ?? undefined;
  const actor = url.searchParams.get("actor") ?? undefined;

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    projectId,
    filter: { kind, verb, actor },
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const events = await listEventsFiltered(db, {
            orgId,
            projectId,
            subjectKind: kind || null,
            verb: verb || null,
            actorId: actor || null,
            limit: 20,
          });
          return { events };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
