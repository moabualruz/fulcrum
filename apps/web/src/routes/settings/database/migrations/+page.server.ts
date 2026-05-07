/**
 * Settings → Database → Migrations page server load function.
 *
 * ⚠️  FLAG (P1#19 / P1#04 SyntaxError incident):
 *     Direct cross-package imports from `src/db/` into the SvelteKit web package
 *     fail during `vite build` because the `db/` layer uses Bun-native APIs
 *     (`Bun.file()`, etc.) that Node.js/Vite's ESM loader cannot parse.
 *
 *     Per task instructions: "route through SvelteKit's package alias mechanism
 *     (typically `$lib/server/...`) or flag".
 *
 *     This is FLAGGED here. Full integration requires:
 *       1. Move MigratorService consumption behind a `$lib/server/migrations.ts`
 *          abstraction that can be shimmed at build time.
 *       2. OR: Wire through the db.router tRPC procedures when @trpc/server is
 *          added (Pillar 13).
 *       3. OR: Expose a REST endpoint via the `/api/db` route when P1#04's API
 *          layer lands.
 *
 *     Until one of the above is in place (specifically Pillar 13 tRPC wiring),
 *     the `load` function always throws error(501, INTERNAL_NOT_WIRED_YET).
 *     There is no conditional stub-data path — it is unconditionally unimplemented.
 *
 * ⚠️  FLAG (P1#06): No permission gate yet — waiting for Better-Auth middleware.
 *
 * C6: No raw SQL.
 * C4: Web surface at feature parity with CLI (deferred pending build fix above).
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";

/** Shape of a migration row for the client. */
export interface MigrationRow {
  version: number;
  name: string;
  appliedAt: string;
  checksum: string;
  direction: "up" | "down";
}

export interface MigrationPageData {
  history: MigrationRow[];
  status: { current: string | null; pending: string[]; pastDue: number };
}

/**
 * Error code surfaced to the client when the tRPC / API layer is not yet wired.
 *
 * Thrown by both `load` and the `migrate` action so the page renders a
 * clear "not wired" message rather than silently returning empty data.
 *
 * TODO(P1#04 / P13): Remove this throw when Pillar 13 tRPC wiring lands.
 * Replace with real consumption of `event.locals.container` (P1#04 owns wiring).
 */
const INTERNAL_NOT_WIRED_YET = "INTERNAL_NOT_WIRED_YET";

export const load: PageServerLoad = () => {
  // Use SvelteKit's error() helper — throws an HttpError routed to the error
  // page, NOT this page component. This is louder than returning empty data
  // (which would silently hide the "not wired" state) and avoids type errors
  // from returning `never` directly (which confused the Svelte compiler).
  //
  // P1#04 (SvelteKit locals wiring) + Pillar 13 (tRPC) own the real implementation.
  // TODO(P1#04 / P13): Remove this throw when Pillar 13 tRPC wiring lands.
  error(501, {
    message:
      `db.migrations: load not yet implemented — requires Pillar 13 tRPC + P1#04 SvelteKit locals wiring. ` +
      `Error code: ${INTERNAL_NOT_WIRED_YET}`,
  });
};

export const actions: Actions = {
  /**
   * Form action: migrate to a target version or to latest.
   *
   * Throws loudly until the cross-package build issue is resolved (see FLAGs above).
   * POST body: targetVersion (optional), force (checkbox).
   *
   * TODO(P1#04 / P13): Replace throw with real consumption of event.locals.container.
   */
  migrate: async () => {
    error(501, {
      message:
        `db.migrations: migrate action not yet implemented — requires Pillar 13 tRPC + P1#04 SvelteKit locals wiring. ` +
        `Error code: ${INTERNAL_NOT_WIRED_YET}`,
    });
  },
};
