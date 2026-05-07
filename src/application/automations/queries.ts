import type { EntityManager } from "@mikro-orm/postgresql";

import {
  AutomationService,
  type AutomationOutput,
  type AutomationTemplate,
} from "../../services/AutomationService.ts";
import { getEventBus } from "../../subscriptions/event-bus.ts";

export interface AutomationAppContext {
  orgId: string;
  userId: string;
}

export function listAutomations(
  em: EntityManager,
  ctx: AutomationAppContext,
  input: { projectId: string },
): Promise<AutomationOutput[]> {
  return new AutomationService(em, getEventBus()).list(ctx.orgId, input.projectId);
}

export function getAutomationTemplates(em: EntityManager): AutomationTemplate[] {
  return new AutomationService(em, getEventBus()).getTemplates();
}
