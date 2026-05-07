import type { TRPCContext } from "@fulcrum/server/trpc/context.ts";
import { ensureRequestId, FULCRUM_REQUEST_ID_HEADER } from "@fulcrum/server/trpc/context.ts";

export { FULCRUM_REQUEST_ID_HEADER };

export function applyRequestId(ctx: TRPCContext): string {
  return ensureRequestId(ctx);
}
