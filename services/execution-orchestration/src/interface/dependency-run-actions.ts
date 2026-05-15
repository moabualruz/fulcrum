import type { EntityManager } from "typeorm";

import type {
  DispatchDependencyRunForTasksInput,
  PreviewDependencyRunForTasksInput,
} from "@execution-orchestration/application/dependency-run-actions.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export async function previewDependencyRunForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: PreviewDependencyRunForTasksInput,
) {
  const service = await import("@execution-orchestration/application/dependency-run-actions.ts");
  return service.previewDependencyRunForTasks(em, ctx, input);
}

export async function dispatchDependencyRunForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DispatchDependencyRunForTasksInput,
) {
  const service = await import("@execution-orchestration/application/dependency-run-actions.ts");
  return service.dispatchDependencyRunForTasks(em, ctx, input);
}
