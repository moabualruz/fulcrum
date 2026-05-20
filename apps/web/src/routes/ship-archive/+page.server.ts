import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `ship-archive` was a mislabeled route: it rendered the account-deletion +
 * data-export page (password-verified permanent-delete flow), not the OD Ship
 * release archive. Its current content is preserved verbatim under
 * `_migrated-content/+page.svelte.preserved` so the route-rebuild PRD
 * `prd-web-ship-release-archive-od-fidelity` can re-home the account-deletion
 * page to Settings · Danger (`/settings/account/delete`, owned by the
 * still-unbuilt `prd-web-system-account-security`) without feature loss.
 *
 * Until that PRD ships the real OD release archive, the old `/ship-archive`
 * path resolves via a 308 permanent redirect to `/settings` (the live Settings
 * surface that hosts the account-security/Danger cluster). The account-delete
 * + data-export flow is preserved intact for the account-security PRD to lift.
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/settings");
};
