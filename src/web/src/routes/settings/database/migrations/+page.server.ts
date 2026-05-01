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
 *     Until one of the above is in place, this page loads stub data in
 *     production builds and is fully functional in `bun run dev` mode
 *     (which uses Bun's native runtime, not Vite's Node.js build).
 *
 * ⚠️  FLAG (P1#06): No permission gate yet — waiting for Better-Auth middleware.
 *
 * C6: No raw SQL.
 * C4: Web surface at feature parity with CLI (deferred pending build fix above).
 */

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
 * Stub load function — returns placeholder data until the cross-package
 * import issue is resolved (see FLAGs above).
 *
 * In `bun run dev` mode, swap this stub for the real implementation:
 *
 *   import { initOrm } from "../../../../../../db/mikro-orm.config.ts";
 *   import { MigratorService } from "../../../../../../db/migrator-service.ts";
 *   import { SchemaMigration } from "../../../../../../db/entities/SchemaMigration.ts";
 *   import { SchemaMigrationRepository } from "../../../../../../db/repositories/SchemaMigrationRepository.ts";
 *   import { EventRepository } from "../../../../../../db/repositories/core/EventRepository.ts";
 *   import { Event } from "../../../../../../db/entities/core/Event.ts";
 */
export const load: PageServerLoad = () => {
  return {
    streamed: {
      migrations: Promise.resolve<MigrationPageData>({
        history: [],
        status: { current: null, pending: [], pastDue: 0 },
      }),
    },
  };
};

export const actions: Actions = {
  /**
   * Form action: migrate to a target version or to latest.
   *
   * Stub — deferred until cross-package build issue is resolved (see FLAGs above).
   * POST body: targetVersion (optional), force (checkbox).
   */
  migrate: async () => {
    return {
      success: false,
      error:
        "Migration action not yet available in web build. " +
        "Use `fulcrum db migrate` CLI command. " +
        "(See FLAG in +page.server.ts — awaiting P1#04 / Pillar 13 integration.)",
    };
  },
};
