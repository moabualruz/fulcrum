import type { TRPCContext } from "@fulcrum/server/trpc/context.ts";
import { ensureRequestId } from "@fulcrum/server/trpc/context.ts";
import { FULCRUM_REQUEST_ID_HEADER } from "@fulcrum/server/public-api/request-id.ts";

export { FULCRUM_REQUEST_ID_HEADER };

export function applyRequestId(ctx: TRPCContext): string {
  return ensureRequestId(ctx);
}
