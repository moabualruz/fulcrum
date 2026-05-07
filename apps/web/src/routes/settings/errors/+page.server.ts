import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { clearSettingsErrors } from "@/application/settings/commands.ts";
import { listSettingsErrors } from "@/application/settings/queries.ts";
import { AppError } from "@/application/errors.ts";

const PAGE_SIZE = 20;

function appFail(error: unknown) {
  if (error instanceof AppError) return fail(error.kind === "validation" ? 400 : 500, { error: error.message });
  throw error;
}

export const load: PageServerLoad = ({ url, locals }) => {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  return {
    page,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return listSettingsErrors(em, ctx, { page, pageSize: PAGE_SIZE });
      })(),
    },
  };
};

export const actions: Actions = {
  clearBefore: async ({ request, locals }) => {
    const data = await request.formData();
    const before = data.get("before") as string;
    if (!before) return fail(400, { error: "before date required" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await clearSettingsErrors(em, ctx, { before });
    } catch (error) {
      return appFail(error);
    }
  },
};
