import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { deleteArtifactAction, readArtifactDetail } from "$lib/server/artifacts";
import { deleteArtifact } from "../../../../../artifacts/storage.ts";

export const load: PageServerLoad = ({ params }) => {
  return {
    streamed: {
      data: (async () => {
        const db = await openDatabase();
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
  delete: async ({ params, request }) => {
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      const artifact = await readArtifactDetail(db, { orgId, id: params.id! });
      if (!artifact) throw error(404, "Artifact not found");
      const form = await request.formData().catch(() => new FormData());
      const hard = form.get("hard") === "true";
      const confirmed = form.get("confirm") === "true";
      const guard = await deleteArtifact({
        artifact: {
          id: artifact.id,
          orgId: artifact.org_id,
          archived: artifact.archived,
          bodyPath: artifact.body_path,
        },
        callerOrgId: orgId,
        hard,
        confirm: confirmed,
      });
      if (!guard.ok && guard.reason === "confirmation_required") {
        throw error(400, "Hard delete requires confirmation");
      }
      if (!guard.ok) throw error(404, "Artifact not found");
      if (hard) await deleteArtifactAction(db, params.id!, orgId);
      else await db.query(`UPDATE artifacts SET archived = true WHERE id = $1 AND org_id = $2`, [params.id!, orgId]);
    } finally {
      await db.close();
    }
    throw redirect(303, "/artifacts");
  },
};
