import { error, fail, redirect } from "@sveltejs/kit";
// `sveltekit-superforms` barrel-exports `SuperDebug.svelte`, which transitively
// imports the client `superForm` graph and pulls in `$app/navigation` /
// `$app/stores`. Importing from `/server` skips the client barrel entirely so
// this file's test harness does not need to stub those SvelteKit virtuals.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { deleteProject, updateProject } from "../../../../../application/projects/commands.ts";
import { loadProjectOverview } from "../../../../../application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

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
// Note: this loader is intentionally NOT wrapped in SvelteKit's `streamed`
// pattern even though the rest of the detail routes are. The rename `<form>`
// is built via `superValidate` *from* the loaded row's defaults, so the
// initial form state is downstream of the DB read — there's no useful
// header-paints-before-data window to gain by streaming this one row.
export const load: PageServerLoad = async ({ params, parent, locals }) => {
  // Inherit `activeProjectId` from the root layout-data so the
  // `<SetActiveButton />` next to the heading can render its toggle state
  // without an extra round-trip. Tests for this loader don't supply
  // `parent`; guard so older callers keep working.
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const { em, ctx } = await requestAppScope(locals, params.id);
  const data = await loadProjectOverview(em, ctx, params.id);
  if (!data) throw error(404, "Project not found");
  const form = await superValidate(
    { name: data.project.name, description: data.project.description ?? "" },
    valibot(RenameSchema),
  );
  return {
    ...data,
    form,
    activeProjectId: parentData.activeProjectId,
  };
};

export const actions: Actions = {
  rename: async ({ params, request, locals }) => {
    const form = await superValidate(request, valibot(RenameSchema));
    if (!form.valid) return fail(400, { form });
    const { em, ctx } = await requestAppScope(locals, params.id);
    await updateProject(em, ctx, {
        id: params.id!,
        name: form.data.name,
        description: form.data.description ?? null,
      });
    return { form };
  },
  delete: async ({ params, locals }) => {
    const { em, ctx } = await requestAppScope(locals, params.id);
    await deleteProject(em, ctx, params.id!);
    throw redirect(303, "/projects");
  },
};
