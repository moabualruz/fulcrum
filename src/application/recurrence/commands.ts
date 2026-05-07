import type { EntityManager } from "@mikro-orm/postgresql";

import { RecurrenceService, type RecurrenceConfig } from "../../services/RecurrenceService.ts";
import { TaskService } from "../../services/TaskService.ts";

export interface RecurrenceAppContext {
  orgId: string;
  userId: string;
}

function recurrenceService(em: EntityManager): RecurrenceService {
  return new RecurrenceService(em, new TaskService(em));
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
