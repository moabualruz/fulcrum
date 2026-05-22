import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createArtifactApiForEvent, toArtifactDetail, type PublicArtifact } from "$lib/server/artifact-api";

export const load: PageServerLoad = (event) => {
  const { params } = event;
  return {
    streamed: {
      data: (async () => {
        try {
          const publicArtifact = await createArtifactApiForEvent(event).artifacts.get({ id: params.id }) as PublicArtifact;
          const artifact = toArtifactDetail(publicArtifact);
          return { artifact };
        } catch {
          throw error(404, "Artifact not found");
        }
      })(),
    },
  };
};

export const actions: Actions = {
  delete: async (event) => {
    const { params, request } = event;
    try {
      const form = await request.formData().catch(() => new FormData());
      const hard = formBoolean(form, "hard");
      await createArtifactApiForEvent(event).artifacts.delete({ id: params.id!, hard });
    } catch (err) {
      throw error(404, "Artifact not found");
    }
    throw redirect(303, "/artifacts");
  },
};

function formBoolean(form: FormData, key: string): boolean {
  return form.get(key) === "true";
}
