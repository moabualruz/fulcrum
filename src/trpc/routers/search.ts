/**
 * Search sub-router — query + suggest + saved searches + click telemetry.
 *
 * P11#16: recordClick gated behind `search-click-telemetry` flag.
 * P11#16: NL→filter pre-processing gated behind `report-llm-narration` flag.
 * C8: needle-di Container pattern; service resolved from ctx.container when available.
 */

import { z } from "zod";

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const searchRouter = t.router({
  /** query — stub; Pillar 12 replaces with: await searchService.query(input.q, ctx.orgId) */
  query: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(() => []),

  /**
   * recordClick — write search click telemetry row.
   * No-op when `search-click-telemetry` flag OFF; writes when ON.
   */
  recordClick: protectedProcedure
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
      // Check feature flag via env var (lightweight; no DB lookup needed for gate)
      const flags = (process.env["FULCRUM_FEATURES"] ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      if (!flags.includes("search-click-telemetry")) {
        return { recorded: false };
      }

      // Dynamic import to avoid circular deps in stub mode
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
