import type { TRPCContext } from "../../../trpc/context.ts";
import { ensureRequestId, FULCRUM_REQUEST_ID_HEADER } from "../../../trpc/context.ts";

export { FULCRUM_REQUEST_ID_HEADER };

export function applyRequestId(ctx: TRPCContext): string {
  return ensureRequestId(ctx);
}
