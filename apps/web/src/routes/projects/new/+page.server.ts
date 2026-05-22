import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { ProjectFormSchema } from "$lib/server/projects.schema";
import {
  createProjectForEvent,
  createProjectFromSetupForEvent,
  listProjectOptionsForEvent,
} from "$lib/server/project-api";
import { setActiveProject } from "$lib/state/active-project";

export const load: PageServerLoad = async (event) => {
  const form = await superValidate(valibot(ProjectFormSchema));
  const parentProjects = await listProjectOptionsForEvent(event);
  return { form, parentProjects };
};

export const actions: Actions = {
  create: async (event) => {
    const form = await superValidate(event.request, valibot(ProjectFormSchema));
    if (!form.valid) return fail(400, { form });
    const repoPath = form.data.repoPath?.trim() || null;
    const template = form.data.template?.trim() || null;
    const parentId = form.data.parentId?.trim() || null;
    // Template/repo/parent inputs need the richer setup path; a bare project
    // only needs the plain create endpoint.
    if (repoPath || template || parentId) {
      const result = await createProjectFromSetupForEvent(event, {
        slug: form.data.slug,
        name: form.data.name,
        description: form.data.description ?? null,
        kind: form.data.kind ?? "project",
        repoPath,
        template,
        parentId,
      });
      setActiveProject(event.cookies, result.links.project.slug);
      throw redirect(303, `/projects/${result.links.project.id}`);
    }
    const project = await createProjectForEvent(event, {
      slug: form.data.slug,
      name: form.data.name,
      description: form.data.description ?? null,
      kind: form.data.kind ?? "project",
    });
    setActiveProject(event.cookies, project.slug);
    throw redirect(303, `/projects/${project.id}`);
  },
};
