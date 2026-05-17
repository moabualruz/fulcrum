import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { deleteArtifactForWeb } from "@workflow-coordination/interface/artifact-records.ts";
import { getArtifactDetail } from "@workflow-coordination/interface/artifact-records.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals);
        try {
          const artifact = await getArtifactDetail(em, ctx, params.id);
          return { artifact };
        } catch {
          throw error(404, "Artifact not found");
        }
      })(),
    },
  };
};

export const actions: Actions = {
  delete: async ({ params, request, locals }) => {
    const { em, ctx } = await requestServiceScope(locals);
    try {
      const form = await request.formData().catch(() => new FormData());
      await deleteArtifactForWeb(em, ctx, {
        id: params.id!,
        hard: form.get("hard") === "true",
        confirm: form.get("confirm") === "true",
      });
    } catch (err) {
      if (err instanceof AppValidationError) throw error(400, err.message);
      throw error(404, "Artifact not found");
    }
    throw redirect(303, "/artifacts");
  },
};
