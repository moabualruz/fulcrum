import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `build-graph` was a mislabeled route: it rendered a typography/form-field
 * design fixture, not the OD Sugiyama dependency graph. Its current content is
 * preserved verbatim under `_migrated-content/+page.svelte.preserved` so the
 * route-rebuild PRD `prd-web-build-graph-od-fidelity` can re-home the
 * typography/form-field fixtures into `/design-kit` without feature loss.
 *
 * Until that PRD ships the real OD graph, the old `/build-graph` path resolves
 * via a 308 permanent redirect to `/design-kit` (the design-fixture surface
 * that is the named re-home destination for the typography/form content).
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/design-kit");
};
