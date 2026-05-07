import type { EntityManager } from "@mikro-orm/postgresql";

import {
  AutomationService,
  type AutomationCondition,
  type AutomationOutput,
} from "../../services/AutomationService.ts";
import { getEventBus } from "../../subscriptions/event-bus.ts";
import type { AutomationAppContext } from "./queries.ts";

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
  return new AutomationService(em, getEventBus()).create(ctx.orgId, input);
}

export function updateAutomation(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: UpdateAutomationInput,
): Promise<AutomationOutput | null> {
  return new AutomationService(em, getEventBus()).update(ctx.orgId, input);
}

export function deleteAutomation(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: { id: string },
): Promise<{ deleted: true } | null> {
  return new AutomationService(em, getEventBus()).delete(ctx.orgId, input.id);
}
