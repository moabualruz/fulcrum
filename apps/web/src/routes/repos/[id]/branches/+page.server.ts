import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import {
  checkoutRepositoryBranch,
  createRepositoryBranch,
  deleteRepositoryBranch,
  loadRepositoryBranchesPage,
  REPOSITORY_WRITE_ACTIONS_GATE,
} from "@integration-hub/interface/repository-pages.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { repositoryRouteContext } from "../../repository-route-context";

function gated() {
  return fail(403, {
    ok: false,
    ...REPOSITORY_WRITE_ACTIONS_GATE,
  });
}

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      try {
        return await loadRepositoryBranchesPage(
          repositoryRouteContext(locals, locals?.activeProjectId ?? null),
          params.id,
        );
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
      await createRepositoryBranch(
        repositoryRouteContext(locals, locals?.activeProjectId ?? null),
        { repoId: params.id, name },
      );
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
      await checkoutRepositoryBranch(
        repositoryRouteContext(locals, locals?.activeProjectId ?? null),
        { repoId: params.id, name },
      );
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
      await deleteRepositoryBranch(
        repositoryRouteContext(locals, locals?.activeProjectId ?? null),
        { repoId: params.id, name },
      );
      return { ok: true };
    } catch (e) {
      if (e instanceof AppError && e.kind === "forbidden") return gated();
      throw e;
    }
  },
};
