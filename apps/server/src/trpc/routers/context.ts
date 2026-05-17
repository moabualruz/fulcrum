import { z } from "zod";

import { previewContext } from "@knowledge-workspace/application/context/queries.ts";
import { requireTrpcEntityManager } from "../context.ts";
import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { OptionalRecordInputSchema, StubOperationOutputSchema, op } from "./stub-helpers.ts";

const ContextPreviewInputSchema = z.object({
  projectId: z.uuid().nullable().optional(),
  taskId: z.uuid(),
  includeGlobal: z.boolean().optional(),
});

export const contextRouter = t.router({
  assemble: permissionedProcedure({ resource: "context", action: "assemble" })
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "assemble")),
  preview: permissionedProcedure({ resource: "context", action: "preview" })
    .input(ContextPreviewInputSchema)
    .query(({ ctx, input }) => previewContext(
      requireTrpcEntityManager(ctx),
      { orgId: ctx.orgId, userId: ctx.userId },
      {
        projectId: input.projectId ?? null,
        taskId: input.taskId,
        includeGlobal: input.includeGlobal,
      },
    )),
});
