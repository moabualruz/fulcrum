import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `build-runs` was a mislabeled route: it rendered the Review code-review-loop
 * workbench (diff, annotation, QA-exhaustion gate, UAT handoff), not the OD
 * Build runs feed. Its current content is preserved verbatim under
 * `_migrated-content/+page.svelte.preserved` so the route-rebuild PRD
 * `prd-web-build-runs-feed-od-fidelity` can re-home the code-review-loop
 * workbench into the Review cluster without feature loss.
 *
 * Until that PRD ships the real OD runs feed, the old `/build-runs` path
 * resolves via a 308 permanent redirect to `/runs` (the existing runs surface,
 * the closest live home for the runs/review family).
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/runs");
};
