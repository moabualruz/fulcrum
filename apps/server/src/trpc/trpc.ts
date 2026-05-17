import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "./context.ts";
import { ensureRequestId } from "./context.ts";
import type { TrpcProcedureMeta } from "./permissions.ts";
import { runWithTRPCSpan } from "./middleware/otel.ts";

export const t = initTRPC.context<TrpcContext>().meta<TrpcProcedureMeta>().create({
  errorFormatter({ shape, ctx }) {
    const requestId = ctx ? ensureRequestId(ctx) : "";
    return {
      ...shape,
      data: {
        ...shape.data,
        requestId,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure.use(async ({ ctx, next, path, type }) => {
  ensureRequestId(ctx);
  return runWithTRPCSpan({
    ctx,
    path,
    type,
    run: () => next({ ctx }),
  });
});
