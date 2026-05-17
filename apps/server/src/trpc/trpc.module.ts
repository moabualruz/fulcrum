import "reflect-metadata";

import { Module } from "@nestjs/common";

import { TrpcService } from "./trpc.service.ts";
import { TrpcRouter } from "./trpc.router.ts";

@Module({
  providers: [TrpcService, TrpcRouter],
  exports: [TrpcService, TrpcRouter],
})
export class TrpcModule {}
