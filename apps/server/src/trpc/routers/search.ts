/**
 * Search sub-router — query + suggest + saved searches + click telemetry.
 *
 * Click telemetry and natural-language filter translation are feature-gated.
 * Services resolve from the request container when available.
 */

import { z } from "zod";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SavedSearchCreateInputSchema,
  SavedSearchDeleteInputSchema,
  SavedSearchOutputSchema,
  SavedSearchUpdateInputSchema,
  updateSavedSearch,
} from "@knowledge-workspace/application/search/saved-searches.ts";
import { SearchQueryService } from "@knowledge-workspace/application/search/query-service.ts";
import { SnapshotService } from "@knowledge-workspace/application/search/snapshot-service.ts";

// ── Schemas ───────────────────────────────────────────────────────────────────

const SearchFiltersSchema = z.object({
  kinds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  scope: z.enum(["current", "all", "global"]).optional(),
  statuses: z.array(z.string()).optional(),
  dateRange: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
});

/** max limit=100 enforced in schema */
const SearchQueryInputSchema = z.object({
  term: z.string().default(""),
  filters: SearchFiltersSchema.optional(),
  facets: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

const SearchResultSchema = z.object({
  id: z.string(),
  entityKind: z.string(),
  entityId: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  labels: z.array(z.string()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  projectId: z.string().nullable(),
  status: z.string().nullable(),
  rank: z.number(),
  snippet: z.string(),
});

const SearchQueryOutputSchema = z.object({
  results: z.array(SearchResultSchema),
  total: z.number(),
  facets: z.record(z.string(), z.record(z.string(), z.number())).optional(),
});

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const searchRouter = t.router({
  /** query — real FTS implementation using SearchQueryService. */
  query: permissionedProcedure({ resource: "search", action: "query" })
    .input(SearchQueryInputSchema)
    .output(SearchQueryOutputSchema)
    .query(async ({ ctx, input }) => {
      const orgId = ctx.orgId;
      if (!orgId) return { results: [], total: 0 };

      // Prefer container injection; fall back to the neutral legacy SQL executor.
      const svc =
        (ctx.container?.get(SearchQueryService) as SearchQueryService | undefined) ??
        (ctx.legacyStore ? new SearchQueryService(ctx.legacyStore) : null);
      if (!svc) return { results: [], total: 0 };

      return svc.query(orgId, input);
    }),

  /** suggest — ILIKE autocomplete for Cmd+K and CLI. */
  suggest: permissionedProcedure({ resource: "search", action: "suggest" })
    .input(
      z.object({
        term: z.string().default(""),
        limit: z.number().int().min(1).max(50).optional().default(10),
      }),
    )
    .output(z.object({ suggestions: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.orgId;
      if (!orgId) return { suggestions: [] };

      const svc =
        (ctx.container?.get(SearchQueryService) as SearchQueryService | undefined) ??
        (ctx.legacyStore ? new SearchQueryService(ctx.legacyStore) : null);
      if (!svc) return { suggestions: [] };

      const suggestions = await svc.suggest(orgId, input.term, input.limit);
      return { suggestions };
    }),

  /** savedList — real: returns saved searches for the org. */
  savedList: permissionedProcedure({ resource: "search", action: "savedList" })
    .input(z.object({}))
    .output(z.array(SavedSearchOutputSchema))
    .query(({ ctx }) => mapAppError(() => listSavedSearches(ctx))),

  /** savedCreate — real: persists a new saved search. */
  savedCreate: permissionedProcedure({ resource: "search", action: "savedCreate" })
    .input(SavedSearchCreateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => mapAppError(() => createSavedSearch(ctx, input))),

  /** savedUpdate — real: updates an existing saved search. */
  savedUpdate: permissionedProcedure({ resource: "search", action: "savedUpdate" })
    .input(SavedSearchUpdateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => mapAppError(() => updateSavedSearch(ctx, input))),

  /** savedDelete — real: deletes a saved search by id. */
  savedDelete: permissionedProcedure({ resource: "search", action: "savedDelete" })
    .input(SavedSearchDeleteInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ ctx, input }) => mapAppError(() => deleteSavedSearch(ctx, input))),

  /**
   * snapshot — returns serialized Orama JSON snapshot for SSR hydration.
   * Only documents belonging to the authenticated org are included.
   */
  snapshot: permissionedProcedure({ resource: "search", action: "query" })
    .input(z.object({}))
    .output(z.object({ snapshot: z.string() }))
    .query(async ({ ctx }) => {
      const orgId = ctx.orgId;
      if (!orgId) return { snapshot: "" };

      const svc =
        (ctx.container?.get(SnapshotService) as SnapshotService | undefined) ??
        (ctx.legacyStore ? new SnapshotService(ctx.legacyStore) : null);
      if (!svc) return { snapshot: "" };

      const snapshot = await svc.buildSnapshot(orgId);
      return { snapshot };
    }),

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

      const { recordSearchClick } = await import("@knowledge-workspace/application/search/click-telemetry.ts");
      if (!ctx.legacyStore || !ctx.orgId) return { recorded: false };

      await recordSearchClick(ctx.legacyStore, {
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
