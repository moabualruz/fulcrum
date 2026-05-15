import { Module } from "@nestjs/common";
import { TypeOrmModule, getEntityManagerToken } from "@nestjs/typeorm";
import { SeedService } from "./seed.ts";

export class SeedModule {}

Module({
  providers: [SeedService],
  exports: [SeedService],
})(SeedModule);
