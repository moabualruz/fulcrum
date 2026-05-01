/**
 * CasbinRuleRepository — flags domain (Pillar 5: Permissions).
 *
 * Stub repository — the FulcrumCasbinAdapter (Pillar 5) consumes this repo
 * via the 5-method node-casbin adapter contract once the `casbin-policies`
 * feature flag is enabled.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<CasbinRule>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { CasbinRule } from "../../entities/flags/CasbinRule.ts";

@injectable()
export class CasbinRuleRepository extends EntityRepository<CasbinRule> {}
