import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { ProjectFormSchema } from "$lib/server/projects.schema";
import { createProject, createProjectFromSetup } from "@work-management/application/projects/commands.ts";
import { listProjectOptions } from "@work-management/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";
import { setActiveProject } from "$lib/state/active-project";

export const load: PageServerLoad = async ({ locals }) => {
  const form = await superValidate(valibot(ProjectFormSchema));
  const { em, ctx } = await requestAppScope(locals);
  const parentProjects = await listProjectOptions(em, ctx);
  return { form, parentProjects };
};

export const actions: Actions = {
  create: async ({ request, locals, cookies }) => {
    const form = await superValidate(request, valibot(ProjectFormSchema));
    if (!form.valid) return fail(400, { form });
    const { em, ctx } = await requestAppScope(locals);
    const repoPath = form.data.repoPath?.trim() || null;
    const template = form.data.template?.trim() || null;
    const parentId = form.data.parentId?.trim() || null;
    if (repoPath || template || parentId) {
      const result = await createProjectFromSetup(em, ctx, {
        slug: form.data.slug,
        name: form.data.name,
        description: form.data.description ?? null,
        repoPath,
        template,
        parentId,
      });
      setActiveProject(cookies, result.links.project.slug);
      throw redirect(303, `/projects/${result.links.project.id}`);
    }
    const project = await createProject(em, ctx, {
      slug: form.data.slug,
      name: form.data.name,
      description: form.data.description ?? null,
    });
    setActiveProject(cookies, project.slug);
    throw redirect(303, `/projects/${project.id}`);
  },
};
