import "reflect-metadata";

import { Injectable } from "@nestjs/common";
import { initTRPC } from "@trpc/server";

import type { TrpcContext } from "./context.ts";
import { ensureRequestId } from "./context.ts";
import type { TrpcProcedureMeta } from "./permissions.ts";
import { runWithTRPCSpan } from "./middleware/otel.ts";

@Injectable()
export class TrpcService {
  readonly trpc = initTRPC
    .context<TrpcContext>()
    .meta<TrpcProcedureMeta>()
    .create({
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

  readonly router = this.trpc.router;
  readonly mergeRouters = this.trpc.mergeRouters;
  readonly createCallerFactory = this.trpc.createCallerFactory;

  readonly publicProcedure = this.trpc.procedure.use(
    async ({ ctx, next, path, type }) => {
      ensureRequestId(ctx);
      return runWithTRPCSpan({
        ctx,
        path,
        type,
        run: () => next({ ctx }),
      });
    },
  );
}
