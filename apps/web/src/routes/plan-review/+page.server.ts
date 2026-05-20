import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `plan-review` was a mislabeled route: it rendered a six-stage workflow-status
 * tracker plus an automation-rule builder, a Jira/GitHub import preview, and
 * custom-field config — a Build/Operate-settings surface, not the OD Plan
 * review approve-gate tripane. Its current content is preserved verbatim under
 * `_migrated-content/+page.svelte.preserved` so the route-rebuild PRD
 * `prd-web-plan-review-od-fidelity` can re-home the workflow-tracker /
 * automation / import / custom-field content into the Build/Operate settings
 * clusters without feature loss.
 *
 * Until that PRD ships the real OD tripane, the old `/plan-review` path
 * resolves via a 308 permanent redirect to `/settings` (the live Settings
 * surface, the named re-home destination for the workflow/automation content).
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/settings");
};
