import type { EntityManager } from "@mikro-orm/postgresql";

import {
  WorkItemAutomationService,
  type AutomationCondition,
  type AutomationOutput,
} from "@work-management/application/work-item-automations.ts";
import { getEventBus } from "@platform-core/application/subscriptions/event-bus.ts";
import type { AutomationAppContext } from "@work-management/application/automations/queries.ts";

export type { AutomationCondition };

export interface CreateAutomationInput {
  projectId: string;
  name: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown> | null;
  condition?: AutomationCondition | null;
  actionType: string;
  actionConfig?: Record<string, unknown> | null;
}

export interface UpdateAutomationInput {
  id: string;
  name?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown> | null;
  condition?: AutomationCondition | null;
  actionType?: string;
  actionConfig?: Record<string, unknown> | null;
  enabled?: boolean;
}

export function createAutomation(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: CreateAutomationInput,
): Promise<AutomationOutput> {
  return new WorkItemAutomationService(em, getEventBus()).create(ctx.orgId, input);
}

export function updateAutomation(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: UpdateAutomationInput,
): Promise<AutomationOutput | null> {
  return new WorkItemAutomationService(em, getEventBus()).update(ctx.orgId, input);
}

export function deleteAutomation(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: { id: string },
): Promise<{ deleted: true } | null> {
  return new WorkItemAutomationService(em, getEventBus()).delete(ctx.orgId, input.id);
}
