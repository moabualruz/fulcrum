import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { createRepoBranch, checkoutRepoBranch, deleteRepoBranch } from "@/application/repos/commands.ts";
import { getRepoBranchesPage, REPO_WRITE_OPS_GATE } from "@/application/repos/queries.ts";
import { AppError } from "@/application/errors.ts";

function gated() {
  return fail(403, {
    ok: false,
    ...REPO_WRITE_OPS_GATE,
  });
}

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      try {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return await getRepoBranchesPage(em, ctx, params.id);
      } catch (e) {
        if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
        throw e;
      }
    })(),
  },
});

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    try {
      if (!name) return fail(400, { ok: false, message: "branch name required" });
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      await createRepoBranch(em, ctx, { repoId: params.id, name });
      return { ok: true };
    } catch (e) {
      if (e instanceof AppError && e.kind === "forbidden") return gated();
      throw e;
    }
  },
  checkout: async ({ params, request, locals }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      await checkoutRepoBranch(em, ctx, { repoId: params.id, name });
      return { ok: true };
    } catch (e) {
      if (e instanceof AppError && e.kind === "forbidden") return gated();
      throw e;
    }
  },
  delete: async ({ params, request, locals }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      await deleteRepoBranch(em, ctx, { repoId: params.id, name });
      return { ok: true };
    } catch (e) {
      if (e instanceof AppError && e.kind === "forbidden") return gated();
      throw e;
    }
  },
};
