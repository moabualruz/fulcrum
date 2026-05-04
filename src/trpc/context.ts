import type { EntityManager } from "@mikro-orm/postgresql";
import type { Container } from "@needle-di/core";
import type { Session } from "better-auth";

import type { ProductDb } from "../product-kernel/db/types.ts";

export const FULCRUM_REQUEST_ID_HEADER = "x-fulcrum-request-id";

/**
 * tRPC context shared by web, CLI, TUI, and tests.
 *
 * Some older product-kernel routers still consume `db`; newer feature routers
 * consume MikroORM `em` + needle-di `container`. Keep both until those surfaces
 * converge.
 */
export interface TrpcContext {
  session: Session | null;
  userId: string | null;
  orgId: string | null;
  em: EntityManager | null;
  container: Container | null;
  db?: ProductDb;
  requestId: string | null;
  responseHeaders: Headers | null;
}

export type TRPCContext = TrpcContext;

export interface CreateContextInput {
  session: Session | null;
  orgId: string | null;
  userId: string | null;
  em: EntityManager | null;
  container: Container | null;
  db?: ProductDb;
  requestId?: string | null;
  responseHeaders?: Headers | null;
}

export function createContext(input: CreateContextInput): TrpcContext {
  return {
    session: input.session,
    orgId: input.orgId,
    userId: input.userId,
    em: input.em,
    container: input.container,
    db: input.db,
    requestId: input.requestId ?? null,
    responseHeaders: input.responseHeaders ?? null,
  };
}

export function ensureRequestId(ctx: TrpcContext): string {
  if (ctx.requestId) return ctx.requestId;
  const requestId = crypto.randomUUID();
  ctx.requestId = requestId;
  ctx.responseHeaders?.set(FULCRUM_REQUEST_ID_HEADER, requestId);
  return requestId;
}
