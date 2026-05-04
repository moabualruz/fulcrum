/** Context stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";
import { OptionalRecordInputSchema, StubOperationOutputSchema, op } from "./stub-helpers.ts";

export const contextRouter = t.router({
  assemble: protectedProcedure
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "assemble")),
  preview: protectedProcedure
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "preview")),
});
