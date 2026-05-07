import type { EntityManager } from "@mikro-orm/postgresql";
import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";
import type { Session } from "better-auth";

import type { LegacySymphonyStore } from "@/application/legacy/symphony.ts";

export const FULCRUM_REQUEST_ID_HEADER = "x-fulcrum-request-id";

/**
 * tRPC context shared by web, CLI, TUI, and tests.
 *
 * Canonical data access is via MikroORM `em` + needle-di `container`.
 * `legacyStore` is retained only for Symphony compatibility procedures while
 * application orchestration queries continue moving to EntityManager.
 */
export interface TrpcContext {
  session: Session | null;
  userId: string | null;
  orgId: string | null;
  em: EntityManager | null;
  container: Container | null;
  legacyStore?: LegacySymphonyStore;
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
  legacyStore?: LegacySymphonyStore;
  db?: LegacySymphonyStore;
  requestId?: string | null;
  responseHeaders?: Headers | null;
}

export function createContext(input: CreateContextInput): TrpcContext {
  const legacyInput = input as CreateContextInput & Record<string, LegacySymphonyStore | undefined>;
  return {
    session: input.session,
    orgId: input.orgId,
    userId: input.userId,
    em: input.em,
    container: input.container,
    legacyStore: input.legacyStore ?? legacyInput["db"],
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

export function requireTrpcEntityManager(
  ctx: Pick<TrpcContext, "em">,
  message = "EntityManager could not be resolved.",
): EntityManager {
  if (ctx.em) return ctx.em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export function optionalTrpcEntityManager(ctx: Pick<TrpcContext, "em">): EntityManager | null {
  return ctx.em;
}
