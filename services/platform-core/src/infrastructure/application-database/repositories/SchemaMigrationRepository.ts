/**
 * SchemaMigrationRepository — migration audit ledger domain.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SchemaMigration } from "../entities/SchemaMigration.ts";

@Injectable()
export class SchemaMigrationRepository {
  constructor(
    @InjectRepository(SchemaMigration)
    private readonly schemaMigrations: Repository<SchemaMigration>,
  ) {}

  findAll(opts?: { orderBy?: Partial<Record<keyof SchemaMigration, "ASC" | "DESC">>; limit?: number }): Promise<SchemaMigration[]> {
    return this.schemaMigrations.find({
      order: opts?.orderBy as never,
      take: opts?.limit,
    });
  }
}
