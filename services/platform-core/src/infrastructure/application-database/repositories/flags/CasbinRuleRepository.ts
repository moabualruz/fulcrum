/**
 * CasbinRuleRepository — flags domain (Pillar 5: Permissions).
 *
 * Stub repository — the FulcrumCasbinAdapter (Pillar 5) consumes this repo
 * via the 5-method node-casbin adapter contract once the `casbin-policies`
 * feature flag is enabled.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CasbinRule } from "../../entities/flags/CasbinRule.ts";

@Injectable()
export class CasbinRuleRepository {
  constructor(
    @InjectRepository(CasbinRule)
    private readonly casbinRules: Repository<CasbinRule>,
  ) {}
}
