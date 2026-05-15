import type { EntityManager } from "typeorm";

import type { AgentRun } from "@platform-core/infrastructure/application-database/entities/orchestration/AgentRun.ts";
import type { Task } from "@platform-core/infrastructure/application-database/entities/tasks/Task.ts";
import type { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";

export const DEFAULT_HOOK_TIMEOUT_MS = 60_000;

export type LifecycleHookName =
  | "after_create"
  | "before_run"
  | "after_run"
  | "before_remove"
  | "on_failure"
  | "on_cancel";

export interface LifecycleHookContext {
  run: AgentRun;
  task: Task;
  workspacePath: string;
  attempt: number;
}

export interface LifecycleHookMeta {
  hookName: LifecycleHookName;
  signal: AbortSignal;
  timeoutMs: number;
}

export type LifecycleHook = (
  ctx: LifecycleHookContext,
  meta: LifecycleHookMeta,
) => void | Promise<void>;

export type LifecycleHooks = Partial<Record<LifecycleHookName, LifecycleHook>>;

export interface LifecycleHookTimeoutConfig {
  hooks_timeout_ms?: number;
  after_create_timeout_ms?: number;
  before_run_timeout_ms?: number;
  after_run_timeout_ms?: number;
  before_remove_timeout_ms?: number;
  on_failure_timeout_ms?: number;
  on_cancel_timeout_ms?: number;
}

export interface ContextAssembler {
  assemble(ctx: LifecycleHookContext, signal: AbortSignal): Promise<unknown>;
}

export interface BeforeRunContextHook {
  handle(
    runId: string,
    taskId: string,
    agentType: string,
    ctx: { workspacePath: string },
  ): Promise<unknown>;
}

export interface DispatchLifecycleHookOptions {
  contextAssembler?: ContextAssembler;
  beforeRunContextHook?: BeforeRunContextHook;
}

export class HookTimeoutError extends Error {
  readonly hookName: LifecycleHookName;
  readonly timeoutMs: number;

  constructor(hookName: LifecycleHookName, timeoutMs: number) {
    super(`Lifecycle hook ${hookName} exceeded timeout ${timeoutMs}ms`);
    this.name = "HookTimeoutError";
    this.hookName = hookName;
    this.timeoutMs = timeoutMs;
  }
}

export async function dispatchLifecycleHook(
  em: EntityManager,
  hookName: LifecycleHookName,
  ctx: LifecycleHookContext,
  hooks: LifecycleHooks = {},
  timeoutConfig: LifecycleHookTimeoutConfig = {},
  options: DispatchLifecycleHookOptions = {},
): Promise<void> {
  const timeoutMs = resolveHookTimeoutMs(hookName, timeoutConfig);
  const startedAt = performance.now();

  try {
    await runHookWithTimeout(
      hookName,
      timeoutMs,
      async (signal) => {
        if (hookName === "before_run") {
          await options.contextAssembler?.assemble(ctx, signal);
          await options.beforeRunContextHook?.handle(
            ctx.run.id,
            ctx.task.id,
            ctx.run.agentName ?? "",
            { workspacePath: ctx.workspacePath },
          );
        }

        await hooks[hookName]?.(ctx, { hookName, signal, timeoutMs });
      },
    );
  } finally {
    await emitHookDispatchedEvent(
      em,
      ctx,
      hookName,
      Math.max(0, Math.round(performance.now() - startedAt)),
    );
  }
}

export function resolveHookTimeoutMs(
  hookName: LifecycleHookName,
  timeoutConfig: LifecycleHookTimeoutConfig,
): number {
  const timeoutMs = timeoutConfig[`${hookName}_timeout_ms`];
  return timeoutMs ?? timeoutConfig.hooks_timeout_ms ?? DEFAULT_HOOK_TIMEOUT_MS;
}

async function runHookWithTimeout(
  hookName: LifecycleHookName,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timeout = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new HookTimeoutError(hookName, timeoutMs)),
      { once: true },
    );
  });

  await Promise.race([run(signal), timeout]);
}

async function emitHookDispatchedEvent(
  em: EntityManager,
  ctx: LifecycleHookContext,
  hookName: LifecycleHookName,
  durationMs: number,
): Promise<void> {
  const [{ Event }, { Org }] = await Promise.all([
    import("@platform-core/infrastructure/application-database/entities/core/Event.ts"),
    import("@platform-core/infrastructure/application-database/entities/auth/Org.ts"),
  ]);
  const fork = em.fork();
  const eventsRepo = fork.getRepository(Event) as EventRepository;
  const orgId = entityId(ctx.run.org) ?? entityId(ctx.task.org);

  if (!orgId) {
    throw new Error("Cannot emit hook_dispatched event without org id");
  }

  eventsRepo.create({
    org: fork.getReference(Org, orgId),
    subjectKind: "agent_run",
    subjectId: ctx.run.id,
    verb: "hook_dispatched",
    payload: { hookName, durationMs },
    createdAt: new Date(),
  });

  await fork.flush();
}

function entityId(entity: { id?: string } | string | undefined): string | undefined {
  if (typeof entity === "string") return entity;
  return entity?.id;
}
