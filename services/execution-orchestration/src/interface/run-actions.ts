import type { EntityManager } from "typeorm";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export async function dispatchTaskRun(
  em: EntityManager,
  ctx: AppContext,
  input: { taskId: string; agent: string },
) {
  const commands = await import("@execution-orchestration/application/runs/commands.ts");
  return commands.dispatchTaskRun(em, ctx, input);
}

export async function dispatchRun(
  em: EntityManager,
  ctx: AppContext,
  input: { agentName: string; prompt: string },
) {
  const commands = await import("@execution-orchestration/application/runs/commands.ts");
  return commands.dispatchRun(em, ctx, input);
}

export async function cancelRun(em: EntityManager, ctx: AppContext, id: string) {
  const commands = await import("@execution-orchestration/application/runs/commands.ts");
  return commands.cancelRun(em, ctx, id);
}

export async function retryRun(em: EntityManager, ctx: AppContext, id: string) {
  const commands = await import("@execution-orchestration/application/runs/commands.ts");
  return commands.retryRun(em, ctx, id);
}
