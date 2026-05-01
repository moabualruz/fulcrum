import { error, fail, redirect } from "@sveltejs/kit";
// `sveltekit-superforms` barrel-exports `SuperDebug.svelte`, which transitively
// imports the client `superForm` graph and pulls in `$app/navigation` /
// `$app/stores`. Importing from `/server` skips the client barrel entirely so
// this file's test harness does not need to stub those SvelteKit virtuals.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { updateProjectAction, deleteProjectAction } from "$lib/server/projects";

// Detail-page rename uses a narrower schema than `ProjectFormSchema` — slug
// is immutable post-create (it's the URL-stable identifier baked into events
// + cookies); only `name` and `description` are editable here.
const RenameSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Name is required"),
    v.maxLength(80, "Name is too long"),
  ),
  description: v.optional(
    v.pipe(v.string(), v.maxLength(280, "Description is too long")),
  ),
});

// PGlite returns timestamp columns as JS `Date` values; the page expects an
// ISO string so the `formatUpdated` helper can `slice()` it deterministically
// across timezones — convert at the boundary.
interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: Date | string;
}

export const load: PageServerLoad = async ({ params, parent }) => {
  // Inherit `activeProjectId` from the root layout-data so the
  // `<SetActiveButton />` next to the heading can render its toggle state
  // without an extra round-trip. Tests for this loader don't supply
  // `parent`; guard so older callers keep working.
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const db = await openProductDb();
  try {
    const rows = await db.query<ProjectRow>(
      `SELECT id, slug, name, description, updated_at FROM projects WHERE id = $1`,
      [params.id],
    );
    if (rows.length === 0) throw error(404, "Project not found");
    const row = rows[0]!;
    const project = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
    const form = await superValidate(
      { name: project.name, description: project.description ?? "" },
      valibot(RenameSchema),
    );
    return { project, form, activeProjectId: parentData.activeProjectId };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  rename: async ({ params, request }) => {
    const form = await superValidate(request, valibot(RenameSchema));
    if (!form.valid) return fail(400, { form });
    const db = await openProductDb();
    try {
      await updateProjectAction(db, {
        id: params.id!,
        name: form.data.name,
        description: form.data.description ?? null,
      });
    } finally {
      await db.close();
    }
    return { form };
  },
  delete: async ({ params }) => {
    const db = await openProductDb();
    try {
      await deleteProjectAction(db, params.id!);
    } finally {
      await db.close();
    }
    throw redirect(303, "/projects");
  },
};
