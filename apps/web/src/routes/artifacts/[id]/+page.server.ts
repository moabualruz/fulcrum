import { error, redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { deleteArtifactForWeb } from "@workflow-coordination/interface/artifact-records.ts";
import { getArtifactDetail } from "@workflow-coordination/interface/artifact-records.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { createArtifactApiForEvent } from "$lib/server/artifact-api";

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
  delete: async (event) => {
    const { params, request, locals } = event;
    const { em, ctx } = await requestServiceScope(locals);
    try {
      const form = await request.formData().catch(() => new FormData());
      const hard = formBoolean(form, "hard");
      await deleteArtifactForWeb(em, ctx, {
        id: params.id!,
        hard,
        confirm: form.get("confirm") === "true",
      });
      await syncPublicArtifactDelete(event, params.id!, hard);
    } catch (err) {
      if (err instanceof AppValidationError) throw error(400, err.message);
      throw error(404, "Artifact not found");
    }
    throw redirect(303, "/artifacts");
  },
};

async function syncPublicArtifactDelete(event: RequestEvent, id: string, hard: boolean): Promise<void> {
  if (!publicApiBackendConfigured()) return;
  const api = createArtifactApiForEvent(event).artifacts;
  if (hard) await api.delete({ id, hard: true });
  else await api.archive({ id });
}

function formBoolean(form: FormData, key: string): boolean {
  return form.get(key) === "true";
}

function publicApiBackendConfigured(): boolean {
  return Boolean(
    process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? process.env["FULCRUM_API_URL"],
  );
}
