import type { PageServerLoad } from "./$types";
import { listSkills } from "../../../../../application/skills/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { ctx } = await requestAppScope(locals);
        const skills = await listSkills({ orgId: ctx.orgId });
        return { skills };
      })(),
    },
  };
};
