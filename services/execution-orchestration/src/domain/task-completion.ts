import type { TaskDependencies } from "@platform-core/infrastructure/application-database/entities/tasks/schemas.ts";
import type { Column } from "@execution-orchestration/domain/dependency-order.ts";

export interface CompletableTask {
  blockedBy?: string | null;
  dependencies?: string[];
}

export interface CompletionDependency {
  id: string;
  column: Column;
}

export interface TaskCompletionBlockerOptions {
  resolveTask?: (taskId: string) => Promise<Pick<CompletionDependency, "id" | "column"> | null | undefined>;
}

export interface TaskLookupStore {
  getTask(taskId: string): Promise<Pick<CompletionDependency, "id" | "column"> | null | undefined>;
}

export interface FulcrumCompletableTask {
  blockedBy?: string | null;
  blockedByIds?: string[];
  dependencies?: TaskDependencies;
}

export async function getTaskCompletionBlocker(
  task: CompletableTask,
  options: TaskCompletionBlockerOptions = {},): Promise<string | undefined> {
  if (task.blockedBy?.trim()) {
    return `task is blocked by ${task.blockedBy.trim()}`;
  }

  const dependencies = task.dependencies ?? [];
  if (dependencies.length === 0 || !options.resolveTask) {
    return undefined;
  }

  const unresolvedDependencies: string[] = [];

  for (const dependencyId of dependencies) {
    const dependency = await options.resolveTask(dependencyId);
    if (!dependency || !isCompletionResolvedColumn(dependency.column)) {
      unresolvedDependencies.push(dependencyId);
    }
  }

  if (unresolvedDependencies.length > 0) {
    return `task has unresolved dependencies: ${unresolvedDependencies.join(", ")}`;
  }

  return undefined;
}

export async function getTaskCompletionBlockerForStore(
  store: TaskLookupStore,
  task: CompletableTask,): Promise<string | undefined> {
  return getTaskCompletionBlocker(task, {
    resolveTask: async (dependencyId) => {
      try {
        return await store.getTask(dependencyId);
      } catch (_error) {
        return null;
      }
    },
  });
}

export async function getTaskCompletionBlockerForWorkItem(
  task: FulcrumCompletableTask,
  options: TaskCompletionBlockerOptions = {},): Promise<string | undefined> {
  const explicitBlocker = task.blockedBy ?? task.blockedByIds?.[0] ?? null;
  return getTaskCompletionBlocker({
    blockedBy: explicitBlocker,
    dependencies: task.dependencies?.blocked_by ?? [],
  }, options);
}

export function isCompletionResolvedColumn(column: Column): boolean {
  return column === "done" || column === "in-review" || column === "archived";
}
