import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * The `offline` route is absorbed into the shell connection banner
 * (`prd-cross-offline-connection-state`, `design-alignment/cross-states.md`
 * §error.html).
 *
 * The old `offline/+page.svelte` did a `window.location.href = "/"` hard
 * reconnect-redirect — not the OD pattern. Offline is now a shell-level state:
 * the `connection.ts` store drives a `Banner` in `+layout.svelte` carrying the
 * COPY.md §3 "You're offline. This change is queued and will sync when you
 * reconnect." copy with a "View queued changes" affordance. Going offline keeps
 * the operator in place, so the active trace survives (DESIGN.md §13
 * invariant 1) — there is no offline destination route to navigate to.
 *
 * The old `/offline` path still resolves (no 404): a 308 permanent redirect
 * lands the operator on `/`, where the shell banner reflects connectivity.
 */
export const load: PageServerLoad = () => {
	redirect(308, "/");
};
