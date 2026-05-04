/**
 * Search sub-router — query + suggest + saved searches + click telemetry.
 *
 * P11#16: recordClick gated behind `search-click-telemetry` flag.
 * P11#16: NL→filter pre-processing gated behind `report-llm-narration` flag.
 * C8: needle-di Container pattern; service resolved from ctx.container when available.
 */

import { z } from "zod";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { EmptyInputSchema, StubRowSchema } from "./stub-helpers.ts";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SavedSearchCreateInputSchema,
  SavedSearchDeleteInputSchema,
  SavedSearchOutputSchema,
  SavedSearchUpdateInputSchema,
  updateSavedSearch,
} from "../../search/saved-searches.ts";

export const searchRouter = t.router({
  /** query — stub; Pillar 12 replaces with real implementation. */
  query: permissionedProcedure({ resource: "search", action: "query" })
    .input(z.object({ q: z.string().default("") }))
    .output(z.array(StubRowSchema))
    .query(() => []),

  /** suggest — stub; Pillar 12 replaces with real implementation. */
  suggest: permissionedProcedure({ resource: "search", action: "suggest" })
    .input(z.object({ q: z.string().default("") }))
    .output(z.array(z.string()))
    .query(() => []),

  /** savedList — real: returns saved searches for the org. */
  savedList: permissionedProcedure({ resource: "search", action: "savedList" })
    .input(EmptyInputSchema)
    .output(z.array(SavedSearchOutputSchema))
    .query(({ ctx }) => listSavedSearches(ctx)),

  /** savedCreate — real: persists a new saved search. */
  savedCreate: permissionedProcedure({ resource: "search", action: "savedCreate" })
    .input(SavedSearchCreateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => createSavedSearch(ctx, input)),

  /** savedUpdate — real: updates an existing saved search. */
  savedUpdate: permissionedProcedure({ resource: "search", action: "savedUpdate" })
    .input(SavedSearchUpdateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => updateSavedSearch(ctx, input)),

  /** savedDelete — real: deletes a saved search by id. */
  savedDelete: permissionedProcedure({ resource: "search", action: "savedDelete" })
    .input(SavedSearchDeleteInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ ctx, input }) => deleteSavedSearch(ctx, input)),

  /**
   * recordClick — write search click telemetry row.
   * No-op when `search-click-telemetry` flag OFF; writes when ON.
   */
  recordClick: permissionedProcedure({ resource: "search", action: "recordClick" })
    .input(
      z.object({
        query: z.string().min(1),
        filters: z.record(z.string(), z.unknown()).optional(),
        resultKind: z.string().min(1),
        resultId: z.string().min(1),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const flags = (process.env["FULCRUM_FEATURES"] ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      if (!flags.includes("search-click-telemetry")) {
        return { recorded: false };
      }

      const { recordSearchClick } = await import("../../search/click-telemetry.ts");
      if (!ctx.db || !ctx.orgId) return { recorded: false };

      await recordSearchClick(ctx.db, {
        orgId: ctx.orgId,
        query: input.query,
        filters: input.filters,
        resultKind: input.resultKind,
        resultId: input.resultId,
        position: input.position,
      });
      return { recorded: true };
    }),
});

export type SearchRouter = typeof searchRouter;
