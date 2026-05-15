import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { FindOptionsWhere } from "typeorm";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";

@Injectable()
export class FeatureFlagRepository {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flags: Repository<FeatureFlag>,
  ) {}

  findOne(where: FindOptionsWhere<FeatureFlag>): Promise<FeatureFlag | null> {
    return this.flags.findOne({ where });
  }
}
