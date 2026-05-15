import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { addProjectRepo, linkProjectRepoToProject } from "@integration-hub/application/repos/commands.ts";
import { listProjectRepoCards } from "@integration-hub/application/repos/queries.ts";
import { getProjectOrNull } from "@work-management/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestAppScope(locals, params.id);
  const project = await getProjectOrNull(em, ctx, params.id);
  if (!project) throw error(404, "Project not found");
  const repos = await listProjectRepoCards(em, ctx);
  return { project, repos };
};

export const actions: Actions = {
  add: async ({ params, request, locals }) => {
    const form = await request.formData();
    try {
      const { em, ctx } = await requestAppScope(locals, params.id);
      await addProjectRepo(em, ctx, {
        kind: form.get("kind") === "remote" ? "remote" : "local",
        path: String(form.get("path") ?? ""),
        url: String(form.get("url") ?? ""),
        name: String(form.get("name") ?? ""),
      });
      return { ok: true };
    } catch (e) {
      return fail(400, {
        ok: false,
        message: e instanceof Error ? e.message : "invalid repo",
      });
    }
  },
  link: async ({ params, request, locals }) => {
    const form = await request.formData();
    const repoId = String(form.get("repoId") ?? "").trim();
    if (!repoId) return fail(400, { ok: false, message: "repoId required" });
    const { em, ctx } = await requestAppScope(locals, params.id);
    await linkProjectRepoToProject(em, ctx, repoId);
    return { ok: true };
  },
};
