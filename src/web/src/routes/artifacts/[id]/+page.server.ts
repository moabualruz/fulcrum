import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { deleteArtifactAction, readArtifactDetail } from "$lib/server/artifacts";

export const load: PageServerLoad = ({ params }) => {
  return {
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const artifact = await readArtifactDetail(db, { orgId, id: params.id });
          if (!artifact) throw error(404, "Artifact not found");
          return { artifact };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  delete: async ({ params }) => {
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await deleteArtifactAction(db, params.id!, orgId);
    } finally {
      await db.close();
    }
    throw redirect(303, "/artifacts");
  },
};
