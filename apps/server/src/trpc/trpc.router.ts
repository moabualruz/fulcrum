import "reflect-metadata";

import { Inject, Injectable, type INestApplication, type OnModuleInit } from "@nestjs/common";
import * as trpcExpress from "@trpc/server/adapters/express";

import { TrpcService } from "./trpc.service.ts";
import { createContext, type TrpcContext } from "./context.ts";
import { TRPC_EXPRESS_MOUNT_PATH } from "../public-api/route-taxonomy.ts";
import { buildFulcrumAppRouter } from "./root-router.ts";

@Injectable()
export class TrpcRouter implements OnModuleInit {
  private _appRouter!: ReturnType<typeof buildFulcrumAppRouter>;

  constructor(@Inject(TrpcService) private readonly trpcService: TrpcService) {}

  onModuleInit() {
    this._appRouter = this.buildRouter();
  }

  get appRouter() {
    return this._appRouter;
  }

  private buildRouter() {
    return buildFulcrumAppRouter(this.trpcService.router);
  }

  /** Build the router on demand so applyMiddleware never captures an undefined router. */
  private resolveAppRouter() {
    if (!this._appRouter) this._appRouter = this.buildRouter();
    return this._appRouter;
  }

  async applyMiddleware(app: INestApplication) {
    app.use(
      TRPC_EXPRESS_MOUNT_PATH,
      trpcExpress.createExpressMiddleware({
        router: this.resolveAppRouter(),
        createContext: ({ req, res }) => {
          const locals = (req as Record<string, unknown>)["locals"] as
            | Record<string, unknown>
            | undefined;

          return createContext({
            session: (locals?.["session"] as TrpcContext["session"]) ?? null,
            orgId: (locals?.["orgId"] as string) ?? null,
            userId: (locals?.["userId"] as string) ?? null,
            em: (locals?.["em"] as TrpcContext["em"]) ?? null,
            container: (locals?.["container"] as TrpcContext["container"]) ?? null,
            legacyStore: locals?.["legacyStore"] as TrpcContext["legacyStore"],
            requestId: req.headers["x-request-id"] as string | undefined ?? null,
            responseHeaders: new Headers(),
          });
        },
      }),
    );
  }
}

export type AppRouter = ReturnType<TrpcRouter["buildRouter"]>;
