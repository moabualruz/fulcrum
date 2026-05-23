import type { EntityManager } from "typeorm";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Session } from "better-auth";

import { createContext } from "../trpc/context.ts";
import { appRouter } from "../trpc/router.ts";
import { WEB_TRPC_BRIDGE_PREFIX } from "./route-taxonomy.ts";

export interface TrpcRouteHandlerInput {
  request: Request;
  session: Session | null;
  orgId: string | null;
  userId: string | null;
  em: EntityManager | null;
  container: DiContainer | null;
}

export function handleTrpcRoute(input: TrpcRouteHandlerInput): Promise<Response> {
  return fetchRequestHandler({
    endpoint: WEB_TRPC_BRIDGE_PREFIX,
    req: input.request,
    router: appRouter,
    createContext: ({ resHeaders }) =>
      createContext({
        session: input.session,
        orgId: input.orgId,
        userId: input.userId,
        em: input.em,
        container: input.container,
        responseHeaders: resHeaders,
      }),
  });
}
