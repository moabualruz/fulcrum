import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  addProjectRepo,
  linkProjectRepoToProject,
  listProjectRepoCards,
} from "@integration-hub/interface/project-repositories.ts";
import { loadProjectOverview } from "@work-management/interface/project-lifecycle.ts";

interface ProjectHeader {
  id: string;
  name: string;
}

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const { em, ctx } = await requestScopedApp(locals, params.id);
  const project = await loadProject(em, ctx, params.id);
  const repos = await listProjectRepoCards(em, ctx);
  return { project, repos };
};

export const actions: Actions = {
  add: async ({ params, request, locals }) => {
    const form = await request.formData();
    try {
      const { em, ctx } = await requestScopedApp(locals, params.id);
      await addProjectRepo(em, ctx, {
        kind: form.get("kind") === "remote" ? "remote" : "local",
        path: String(form.get("path") ?? ""),
        url: String(form.get("url") ?? ""),
        name: String(form.get("name") ?? ""),
      });
      return { ok: true, mode: "addRepo" };
    } catch (e) {
      return fail(400, {
        ok: false,
        mode: "addRepo",
        message: e instanceof Error ? e.message : "invalid repo",
      });
    }
  },
  link: async ({ params, request, locals }) => {
    const form = await request.formData();
    const repoId = String(form.get("repoId") ?? "").trim();
    if (!repoId) return fail(400, { ok: false, mode: "linkRepo", message: "repoId required" });
    try {
      const { em, ctx } = await requestScopedApp(locals, params.id);
      await linkProjectRepoToProject(em, ctx, repoId);
      return { ok: true, mode: "linkRepo" };
    } catch (e) {
      return fail(400, {
        ok: false,
        mode: "linkRepo",
        message: e instanceof Error ? e.message : "invalid repo",
      });
    }
  },
};

async function loadProject(em: Awaited<ReturnType<typeof requestScopedApp>>["em"], ctx: Awaited<ReturnType<typeof requestScopedApp>>["ctx"], projectId: string): Promise<ProjectHeader> {
  const project = await loadProjectOverview(em, ctx, projectId);
  if (!project) throw error(404, "Project not found");
  return {
    id: project.project.id,
    name: project.project.name,
  };
}

async function requestScopedApp(locals: App.Locals, projectId?: string) {
  const { requestServiceScope } = await import("$lib/server/request-service-scope");
  return requestServiceScope(locals, projectId);
}
