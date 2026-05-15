/**
 * RoutingRuleRepository - router domain (Pillar 5, R-01).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import type { EntityManager, DeepPartial } from "typeorm";
import { RoutingRule } from "@execution-orchestration/infrastructure/database/entities/router/RoutingRule.ts";
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

  get manager(): EntityManager {
    return this.routingRules.manager;
  }

  create(data?: DeepPartial<RoutingRule>): RoutingRule {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.routingRules.create(data as any);
  }

  save(entity: RoutingRule): Promise<RoutingRule> {
    type SaveSingle = (entity: RoutingRule) => Promise<RoutingRule>;
    return (this.routingRules.save as unknown as SaveSingle)(entity);
  }

  remove(entity: RoutingRule): Promise<RoutingRule> {
    type RemoveSingle = (entity: RoutingRule) => Promise<RoutingRule>;
    return (this.routingRules.remove as unknown as RemoveSingle)(entity);
  }
}
