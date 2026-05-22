import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createProjectApiForEvent } from "$lib/server/project-api";
import { createRepositoryApiForEvent } from "$lib/server/repository-api";

interface ProjectHeader {
  id: string;
  name: string;
}

export const load: PageServerLoad = async (event) => {
  const { params } = event;
  const project = await loadProject(event, params.id);
  const repos = await createRepositoryApiForEvent(event).repos.projectCards({ projectId: params.id });
  return { project, repos };
};

export const actions: Actions = {
  add: async (event) => {
    const form = await event.request.formData();
    try {
      await createRepositoryApiForEvent(event).repos.addToProject({
        projectId: event.params.id,
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
  link: async (event) => {
    const form = await event.request.formData();
    const repoId = String(form.get("repoId") ?? "").trim();
    if (!repoId) return fail(400, { ok: false, mode: "linkRepo", message: "repoId required" });
    try {
      await createRepositoryApiForEvent(event).repos.linkToProject({
        projectId: event.params.id,
        repoId,
      });
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

async function loadProject(event: Parameters<PageServerLoad>[0], projectId: string): Promise<ProjectHeader> {
  const payload = await createProjectApiForEvent(event).projects.get({ id: projectId });
  const record = (payload as { project?: ProjectHeader }).project ?? (payload as Partial<ProjectHeader>);
  if (!record.id || !record.name) throw error(404, "Project not found");
  return {
    id: record.id,
    name: record.name,
  };
}
