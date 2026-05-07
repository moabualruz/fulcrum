import type { PageServerLoad } from "./$types";
import { listProjectActivityEvents } from "../../../../../../application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

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
        const { em, ctx } = await requestAppScope(locals, projectId);
        const events = await listProjectActivityEvents(em, ctx, {
          subjectKind: kind,
          verb,
          actorId: actor,
          limit: 20,
        });
        return { events };
      })(),
    },
  };
};
