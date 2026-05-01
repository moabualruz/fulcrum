import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { ProjectFormSchema } from "$lib/server/projects.schema";
import { createProjectAction } from "$lib/server/projects";
import { openProductDb } from "$lib/server/db";

export const load: PageServerLoad = async () => {
  const form = await superValidate(valibot(ProjectFormSchema));
  return { form };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, valibot(ProjectFormSchema));
    if (!form.valid) return fail(400, { form });
    const db = await openProductDb();
    try {
      const orgRows = await db.query<{ id: string }>(
        `SELECT id FROM orgs WHERE slug = $1`,
        ["default"],
      );
      if (orgRows.length === 0) {
        return fail(500, {
          form: {
            ...form,
            errors: {
              ...form.errors,
              _errors: ["Default org not found. Run fulcrum product init."],
            },
          },
        });
      }
      const orgId = orgRows[0]!.id;
      await createProjectAction(db, {
        orgId,
        slug: form.data.slug,
        name: form.data.name,
        description: form.data.description ?? null,
      });
    } finally {
      await db.close();
    }
    throw redirect(303, "/projects");
  },
};
