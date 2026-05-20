import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `build-timeline` was a mislabeled route: it rendered the `DESIGN.md §9.1`
 * Document Version Review surface (version list, inline diff, restore confirm,
 * backlinks, review-thread comments), not the OD Build Gantt timeline. Its
 * current content is preserved verbatim under
 * `_migrated-content/+page.svelte.preserved` so the route-rebuild PRD
 * `prd-web-build-timeline-od-fidelity` can re-home the Document Version Review
 * content into the Capture/docs cluster without feature loss.
 *
 * Until that PRD ships the real OD Gantt, the old `/build-timeline` path
 * resolves via a 308 permanent redirect to `/docs` (the Capture/docs cluster,
 * the named re-home destination for the version-review content).
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/docs");
};
