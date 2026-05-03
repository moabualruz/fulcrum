import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listSkills } from "$lib/server/skills";

export const load: PageServerLoad = () => {
  return {
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const skills = await listSkills(db, orgId);
          return { skills };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
