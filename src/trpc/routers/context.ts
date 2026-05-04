/** Context stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { OptionalRecordInputSchema, StubOperationOutputSchema, op } from "./stub-helpers.ts";

export const contextRouter = t.router({
  assemble: permissionedProcedure({ resource: "context", action: "assemble" })
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "assemble")),
  preview: permissionedProcedure({ resource: "context", action: "preview" })
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "preview")),
});
