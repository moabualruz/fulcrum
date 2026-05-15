import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createProjectApiForEvent } from "$lib/server/project-api";
import {
  addProjectRepo,
  linkProjectRepoToProject,
  listProjectRepoCards,
} from "@integration-hub/interface/project-repositories.ts";

interface ProjectHeader {
  id: string;
  name: string;
}

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const project = await loadProject(event, params.id);
  const { em, ctx } = await requestScopedApp(locals, params.id);
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
    const { em, ctx } = await requestScopedApp(locals, params.id);
    await linkProjectRepoToProject(em, ctx, repoId);
    return { ok: true };
  },
};

async function loadProject(event: Parameters<PageServerLoad>[0], projectId: string): Promise<ProjectHeader> {
  try {
    const project = await createProjectApiForEvent(event).projects.get({ id: projectId }) as ProjectHeader;
    return {
      id: project.id,
      name: project.name,
    };
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "status" in cause && (cause as { status?: unknown }).status === 404) {
      throw error(404, "Project not found");
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw error(502, message);
  }
}

async function requestScopedApp(locals: App.Locals, projectId?: string) {
  const { requestServiceScope } = await import("$lib/server/request-service-scope");
  return requestServiceScope(locals, projectId);
}
