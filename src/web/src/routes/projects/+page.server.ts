import type { PageServerLoad } from "./$types";
import { listProjects } from "$lib/product-queries";

export const load: PageServerLoad = async ({ parent }) => {
  // Inherit `activeProjectId` from the root layout-data (`+layout.server.ts`
  // returns `{ activeProjectId }` from `locals.activeProjectId`). This lets
  // each row's `<SetActiveButton />` toggle its `active` state without an
  // extra round-trip. Tests for the route load do not always supply
  // `parent`; guard so legacy callers keep working.
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const projects = await listProjects();
  return { projects, activeProjectId: parentData.activeProjectId };
};
