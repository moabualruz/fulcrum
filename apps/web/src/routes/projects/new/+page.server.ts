import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { ProjectFormSchema } from "$lib/server/projects.schema";
import { createProject, createProjectFromSetup, listProjectOptions } from "@work-management/interface/project-lifecycle.ts";
import { requestProjectScope } from "../project-request-scope";
import { setActiveProject } from "$lib/state/active-project";

export const load: PageServerLoad = async ({ locals }) => {
  const form = await superValidate(valibot(ProjectFormSchema));
  const { em, ctx } = await requestProjectScope(locals);
  const parentProjects = await listProjectOptions(em, ctx);
  return { form, parentProjects };
};

export const actions: Actions = {
  create: async ({ request, locals, cookies }) => {
    const form = await superValidate(request, valibot(ProjectFormSchema));
    if (!form.valid) return fail(400, { form });
    const { em, ctx } = await requestProjectScope(locals);
    const repoPath = form.data.repoPath?.trim() || null;
    const template = form.data.template?.trim() || null;
    const parentId = form.data.parentId?.trim() || null;
    if (repoPath || template || parentId) {
      const result = await createProjectFromSetup(em, ctx, {
        slug: form.data.slug,
        name: form.data.name,
        description: form.data.description ?? null,
        kind: form.data.kind ?? "project",
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
      kind: form.data.kind ?? "project",
    });
    setActiveProject(cookies, project.slug);
    throw redirect(303, `/projects/${project.id}`);
  },
};
