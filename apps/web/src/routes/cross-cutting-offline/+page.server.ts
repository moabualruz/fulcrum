import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * The `cross-cutting-offline` route is absorbed into the shell connection
 * banner (`prd-cross-offline-connection-state`,
 * `design-alignment/cross-states.md` §error.html).
 *
 * Its `offline | syncing | online` connection state machine was the keeper
 * logic: it now lives in `apps/web/src/lib/stores/connection.ts` and drives a
 * single `Banner` in `+layout.svelte`, so the offline + queued-mutation state
 * is shown on every route instead of behind a standalone preview route.
 *
 * The old `/cross-cutting-offline` path still resolves (no 404): a 308
 * permanent redirect lands the operator on `/`, where the shell connection
 * banner reflects connectivity and the queued-changes affordance.
 */
export const load: PageServerLoad = () => {
	redirect(308, "/");
};
