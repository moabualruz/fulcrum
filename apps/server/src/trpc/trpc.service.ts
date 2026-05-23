import "reflect-metadata";

import { Injectable } from "@nestjs/common";

import { publicProcedure, t } from "./trpc.ts";

@Injectable()
export class TrpcService {
  readonly trpc = t;
  readonly router = this.trpc.router;
  readonly mergeRouters = this.trpc.mergeRouters;
  readonly createCallerFactory = this.trpc.createCallerFactory;
  readonly publicProcedure = publicProcedure;
}
