/**
 * RoutingRuleRepository - router domain (Pillar 5, R-01).
 *
 * C6/C7: no raw SQL; routing reads use MikroORM query builder.
 * C8/C9: injectable EntityRepository subclass at router path.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { RoutingRule } from "../../entities/router/RoutingRule.ts";

@injectable()
export class RoutingRuleRepository extends EntityRepository<RoutingRule> {
  async findEnabledForDispatch(
    orgId: string,
    projectId?: string | null,
  ): Promise<RoutingRule[]> {
    const qb = this.createQueryBuilder("rule")
      .where({ org: orgId, enabled: true } as never)
      .orderBy({ priority: "ASC", createdAt: "ASC" });

    if (projectId) {
      qb.andWhere({
        $or: [{ project: projectId }, { project: null }],
      } as never);
    } else {
      qb.andWhere({ project: null } as never);
    }

    return qb.getResultList();
  }
}
