import type { EntityManager } from "typeorm";

import {
  WorkItemAutomationService,
  type AutomationOutput,
  type AutomationTemplate,
} from "@work-management/application/work-item-automations.ts";
import { getEventBus } from "@platform-core/application/subscriptions/event-bus.ts";

export interface AutomationAppContext {
  orgId: string;
  userId: string;
}

export function listAutomations(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: { projectId: string },
): Promise<AutomationOutput[]> {
  return new WorkItemAutomationService(em, getEventBus()).list(ctx.orgId, input.projectId);
}

export function getAutomationTemplates(em: EntityManager): AutomationTemplate[] {
  return new WorkItemAutomationService(em, getEventBus()).getTemplates();
}
