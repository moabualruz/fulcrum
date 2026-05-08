import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { ProjectFormSchema } from "$lib/server/projects.schema";
import { createProject, createProjectFromSetup } from "@/application/projects/commands.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async () => {
  const form = await superValidate(valibot(ProjectFormSchema));
  return { form };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await superValidate(request, valibot(ProjectFormSchema));
    if (!form.valid) return fail(400, { form });
    const { em, ctx } = await requestAppScope(locals);
    const repoPath = form.data.repoPath?.trim() || null;
    const template = form.data.template?.trim() || null;
    const parentId = form.data.parentId?.trim() || null;
    if (repoPath || template || parentId) {
      await createProjectFromSetup(em, ctx, {
        slug: form.data.slug,
        name: form.data.name,
        description: form.data.description ?? null,
        repoPath,
        template,
        parentId,
      });
      throw redirect(303, "/projects");
    }
    await createProject(em, ctx, {
      slug: form.data.slug,
      name: form.data.name,
      description: form.data.description ?? null,
    });
    throw redirect(303, "/projects");
  },
};
