/**
 * FeatureFlagRolloutRepository — platform domain (Pillar 17 cross-cutting).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FeatureFlagRollout } from "../../entities/platform/FeatureFlagRollout.ts";

@Injectable()
export class FeatureFlagRolloutRepository {
  constructor(
    @InjectRepository(FeatureFlagRollout)
    private readonly featureFlagRollouts: Repository<FeatureFlagRollout>,
  ) {}
}
