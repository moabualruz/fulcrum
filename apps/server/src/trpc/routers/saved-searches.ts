/**
 * Saved-searches router — standalone tRPC router for saved search CRUD.
 *
 * Delegates to `src/search/saved-searches.ts` service functions which
 * use the SavedView entity (view_type = 'search').
 *
 * Procedures: list, create, delete (plus update for completeness).
 * Auth: permissionedProcedure pattern from artifacts router.
 */

import { z } from "zod";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SavedSearchCreateInputSchema,
  SavedSearchDeleteInputSchema,
  SavedSearchOutputSchema,
  SavedSearchUpdateInputSchema,
  updateSavedSearch,
} from "@/search/saved-searches.ts";

export const savedSearchesRouter = t.router({
  /** list — returns saved searches visible to the authenticated user */
  list: permissionedProcedure({ resource: "savedSearches", action: "list" })
    .input(z.object({}).optional())
    .output(z.array(SavedSearchOutputSchema))
    .query(({ ctx }) => listSavedSearches(ctx)),

  /** create — persists a new saved search */
  create: permissionedProcedure({ resource: "savedSearches", action: "create" })
    .input(SavedSearchCreateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => createSavedSearch(ctx, input)),

  /** update — updates name/scope/queryJson of a saved search */
  update: permissionedProcedure({ resource: "savedSearches", action: "update" })
    .input(SavedSearchUpdateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => updateSavedSearch(ctx, input)),

  /** delete — removes a saved search (owner only) */
  delete: permissionedProcedure({ resource: "savedSearches", action: "delete" })
    .input(SavedSearchDeleteInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ ctx, input }) => deleteSavedSearch(ctx, input)),
});

export type SavedSearchesRouter = typeof savedSearchesRouter;
