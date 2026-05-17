import type { EntityManager } from "typeorm";

import { WorkItemRecurrenceService, type RecurrenceConfig } from "@work-management/application/work-item-recurrence.ts";
import { WorkItemService } from "@work-management/application/work-item-service.ts";

export interface RecurrenceAppContext {
  orgId: string;
  userId: string;
}

function recurrenceService(em: EntityManager): WorkItemRecurrenceService {
  return new WorkItemRecurrenceService(em, new WorkItemService(em));
}

export async function listRecurrenceRules(
  em: EntityManager,
  appCtx: RecurrenceAppContext,
  taskId: string,
) {
  return recurrenceService(em).list(appCtx.orgId, taskId);
}

export async function createRecurrenceRule(
  em: EntityManager,
  appCtx: RecurrenceAppContext,
  taskId: string,
  input: RecurrenceConfig,
) {
  return recurrenceService(em).create(appCtx.orgId, taskId, input);
}

export async function deleteRecurrenceRule(
  em: EntityManager,
  appCtx: RecurrenceAppContext,
  ruleId: string,
) {
  return recurrenceService(em).delete(appCtx.orgId, ruleId);
}
