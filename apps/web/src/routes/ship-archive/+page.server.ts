import type { PageServerLoad } from "./$types";

/**
 * `ship-archive` route — Ship release-archive timeline (OD `ship-archive.html`).
 *
 * Route-name history: this folder was previously *mislabelled* — it rendered an
 * account-deletion + data-export page (a password-verified permanent-delete
 * flow), not a Ship archive. `prd-cross-mislabeled-route-content-migration`
 * preserved that content verbatim under
 * `_migrated-content/+page.svelte.preserved` and left this server file as a
 * 308 redirect placeholder. `prd-web-ship-release-archive-od-fidelity` now
 * reclaims the `ship-archive` name for its real OD surface: `+page.svelte`
 * renders the release-history timeline, so this server file no longer
 * redirects — the route resolves normally and the OD archive renders.
 *
 * Account-deletion re-home (no feature loss): the preserved account-deletion +
 * data-export flow re-homes to Settings · Danger at `/settings/account/delete`,
 * the `#danger` panel per `design-alignment/ship.md` §ship-archive Migration
 * notes and `design-alignment/auth.md`. That destination route is owned by the
 * still-unbuilt `prd-web-system-account-security`; when it ships it lifts
 * `_migrated-content/+page.svelte.preserved` into the Settings · Danger panel
 * and adds the 301 from the legacy account-danger entry point. Until then the
 * preserved artifact stays beside this route, intact, for that PRD to lift —
 * no account-deletion feature is lost, only relocated.
 *
 * The release / channel / rollout domain model does not exist in the codebase
 * yet (PRD problem statement); the archive is rendered from the OD fixture
 * projection in `+page.svelte` and is a read-only release-history view.
 */
export const load: PageServerLoad = () => {
  return {
    /** Marks the route as the reclaimed OD Ship-archive surface. */
    view: "ship-archive" as const,
  };
};
