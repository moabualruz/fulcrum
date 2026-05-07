import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { ProjectFormSchema } from "$lib/server/projects.schema";
import { createProject } from "../../../../../application/projects/commands.ts";
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
    await createProject(em, ctx, {
      slug: form.data.slug,
      name: form.data.name,
      description: form.data.description ?? null,
    });
    throw redirect(303, "/projects");
  },
};
