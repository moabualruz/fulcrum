import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "./context.ts";

export const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
