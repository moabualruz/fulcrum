import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `operate-alerts` was a mislabeled route: it rendered a login-sessions /
 * active-session management table (`data-operate-alerts-*` hooks), not the OD
 * Operate Alerts console. Its current content is preserved verbatim under
 * `_migrated-content/+page.svelte.preserved` so the route-rebuild PRD
 * `prd-web-operate-alerts-console-od-fidelity` can re-home the login-sessions
 * table into the auth/account-security cluster (Settings active-sessions panel,
 * owned by the still-unbuilt `prd-web-system-account-security`) without feature
 * loss — the `data-operate-alerts-*` hooks are renamed to `data-account-
 * sessions-*` as part of that re-home.
 *
 * Until that PRD ships the real OD Alerts console, the old `/operate-alerts`
 * path resolves via a 308 permanent redirect to `/settings` (the live Settings
 * surface that hosts the account-security cluster).
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/settings");
};
