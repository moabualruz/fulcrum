/**
 * TrpcModule — registers the tRPC AppRouter as a NestJS provider.
 *
 * This makes tRPC a NestJS-managed component: the router, context factory,
 * and fetchRequestHandler are all accessible via NestJS DI. HTTP controllers
 * and tRPC routers coexist, both calling shared domain/application services.
 *
 * The tRPC route handler (/api/trpc) is mounted via NestJS middleware,
 * not through a separate SvelteKit route.
 */

import { Module } from "@nestjs/common";

import { appRouter, type AppRouter } from "./router.ts";
import { createContext, type CreateContextInput } from "./context.ts";
import { t } from "./trpc.ts";

export const APP_ROUTER = Symbol("APP_ROUTER");
export const TRPC_CALLER_FACTORY = Symbol("TRPC_CALLER_FACTORY");

@Module({
  providers: [
    {
      provide: APP_ROUTER,
      useValue: appRouter,
    },
    {
      provide: TRPC_CALLER_FACTORY,
      useValue: t.createCallerFactory(appRouter),
    },
  ],
  exports: [APP_ROUTER, TRPC_CALLER_FACTORY],
})
export class TrpcModule {}

export { appRouter, createContext, type AppRouter, type CreateContextInput };
