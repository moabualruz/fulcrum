import { error, fail, redirect } from "@sveltejs/kit";
// `sveltekit-superforms` barrel-exports `SuperDebug.svelte`, which transitively
// imports the client `superForm` graph and pulls in `$app/navigation` /
// `$app/stores`. Importing from `/server` skips the client barrel entirely so
// this file's test harness does not need to stub those SvelteKit virtuals.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { createProjectApiForEvent } from "$lib/server/project-api";
import { ProjectApiError } from "@work-management/interface/http/project-api-client";

// Detail-page rename uses a narrower schema than `ProjectFormSchema`: slug
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

interface ProjectOverview {
  project: { id: string; slug: string; name: string; description: string | null; updated_at: string };
  summary: { openTasks: number; inProgress: number; done: number; sprintDaysRemaining: number };
}

// Note: this loader is intentionally NOT wrapped in SvelteKit's `streamed`
// pattern even though the rest of the detail routes are. The rename `<form>`
// is built via `superValidate` *from* the loaded row's defaults, so the
// initial form state is downstream of the read: there's no useful
// header-paints-before-data window to gain by streaming this one row.
export const load: PageServerLoad = async (event) => {
  const { params, parent } = event;
  // Inherit `activeProjectId` from the root layout-data so the
  // `<SetActiveButton />` next to the heading can render its toggle state
  // without an extra round-trip. Tests for this loader don't supply
  // `parent`; guard so older callers keep working.
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const data = (await createProjectApiForEvent(event)
    .projects.overview({ id: params.id! })
    .catch((cause: unknown) => {
      if (cause instanceof ProjectApiError && cause.status === 404) throw error(404, "Project not found");
      throw cause;
    })) as ProjectOverview | null;
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
  rename: async (event) => {
    const form = await superValidate(event.request, valibot(RenameSchema));
    if (!form.valid) return fail(400, { form });
    await createProjectApiForEvent(event).projects.update({
      id: event.params.id!,
      name: form.data.name,
      description: form.data.description ?? null,
    });
    return { form };
  },
  delete: async (event) => {
    await createProjectApiForEvent(event).projects.delete({ id: event.params.id! });
    throw redirect(303, "/projects");
  },
};
