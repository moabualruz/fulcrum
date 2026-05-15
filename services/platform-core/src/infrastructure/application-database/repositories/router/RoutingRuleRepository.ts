/**
 * RoutingRuleRepository - router domain (Pillar 5, R-01).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { RoutingRule } from "../../entities/router/RoutingRule.ts";
import { routingEventBus, type RoutingEventBus } from "@fulcrum/server/router/event-bus.ts";

@Injectable()
export class RoutingRuleRepository {
  private eventBus: RoutingEventBus = routingEventBus;

  constructor(
    @InjectRepository(RoutingRule)
    private readonly routingRules: Repository<RoutingRule>,
  ) {}

  setEventBus(bus: RoutingEventBus): void {
    this.eventBus = bus;
  }

  async findEnabledForDispatch(
    orgId: string,
    projectId?: string | null,
  ): Promise<RoutingRule[]> {
    if (projectId) {
      return this.routingRules.find({
        where: [
          { org: { id: orgId }, enabled: true, project: { id: projectId } },
          { org: { id: orgId }, enabled: true, project: IsNull() as any },
        ],
        order: { priority: "ASC", createdAt: "ASC" },
      });
    }
    return this.routingRules.find({
      where: { org: { id: orgId }, enabled: true, project: IsNull() as any },
      order: { priority: "ASC", createdAt: "ASC" },
    });
  }

  async saveRule(rule: RoutingRule): Promise<void> {
    await this.routingRules.save(rule);
    this.eventBus.emitRulesChanged();
  }

  async removeRule(rule: RoutingRule): Promise<void> {
    await this.routingRules.remove(rule);
    this.eventBus.emitRulesChanged();
  }
}
