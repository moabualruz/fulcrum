import type { TaskDependencies } from "@platform-core/infrastructure/application-database/entities/tasks/schemas.ts";
import {
  type Column,
  resolveDependencyOrder,
} from "@execution-orchestration/domain/dependency-order.ts";

export type DependencyRunMode = "task" | "board";

export interface DependencyRunPreviewTask {
  id: string;
  title: string;
  column: Column;
  blockedBy?: string | null;
  dependencies?: TaskDependencies;
}

export interface DependencyRunPreviewInput {
  mode: DependencyRunMode;
  targetTaskIds: string[];
  tasks: DependencyRunPreviewTask[];
  traceId?: string;
}

export interface DependencyRunPreviewItem {
  id: string;
  title: string;
  column: Column;
  selected: boolean;
  dependencyDepth: number;
  dependencyIds: string[];
  blockers: string[];
}

export interface DependencyRunPreview {
  mode: DependencyRunMode;
  traceId?: string;
  targetTaskIds: string[];
  orderedTaskIds: string[];
  tasks: DependencyRunPreviewItem[];
  omittedTaskIds: string[];
  missingTaskIds: string[];
  warnings: string[];
  requiresDisclosure: true;
  blocked: boolean;
}

export function buildDependencyRunPreview(
  input: DependencyRunPreviewInput,): DependencyRunPreview {
  const taskMap = new Map(input.tasks.map((task) => [task.id, task]));
  const targetIds = [...new Set(input.targetTaskIds)];
  const selected = new Set(targetIds);
  const included = new Set<string>;
  const inclusionOrder: string[] = [];
  const missing = new Set<string>;
  const depthByTask = new Map<string, number>;
  const warnings: string[] = [];
  const blockersByTask = new Map<string, string[]>;

  for (const targetId of targetIds) {
    if (!taskMap.has(targetId)) {
      missing.add(targetId);
      warnings.push(`Selected task ${targetId} was not found.`);
      continue;
    }
    collectDependencies(targetId, 0);
  }

  const includedTasks = inclusionOrder.map((id) => taskMap.get(id)).filter((task): task is DependencyRunPreviewTask => Boolean(task));
  const orderedTaskIds = resolveDependencyOrder(includedTasks.map((task) => ({
    id: task.id,
    dependencies: (task.dependencies?.blocked_by ?? []).filter((dependencyId) => included.has(dependencyId)),
  })));
  const orderedTaskSet = new Set(orderedTaskIds);
  const orderedTasks = orderedTaskIds.map((id) => taskMap.get(id)).filter((task): task is DependencyRunPreviewTask => Boolean(task));

  for (const task of orderedTasks) {
    const directMissing = (task.dependencies?.blocked_by ?? []).filter((dependencyId) => !taskMap.has(dependencyId));
    if (directMissing.length > 0) {
      for (const dependencyId of directMissing) {
        addTaskBlocker(task.id, `missing dependency: ${dependencyId}`);
      }
    }

    const completionBlocker = getSynchronousCompletionBlocker(task);
    if (completionBlocker) {
      addTaskBlocker(task.id, completionBlocker);
    }
  }

  for (const targetId of targetIds) {
    const prerequisiteCount = countDependencyTree(targetId);
    if (prerequisiteCount > 0) {
      warnings.push(`Target ${targetId} requires ${prerequisiteCount} prerequisite task(s) before it runs.`);
    }
  }

  for (const [taskId, blockers] of blockersByTask.entries()) {
    for (const blocker of blockers) {
      if (blocker.startsWith("missing dependency: ")) {
        warnings.push(`Missing dependency ${blocker.slice("missing dependency: ".length)} required by ${taskId}.`);
      }
    }
  }
  for (const [taskId, blockers] of blockersByTask.entries()) {
    for (const blocker of blockers) {
      if (!blocker.startsWith("missing dependency: ")) {
        warnings.push(`Task ${taskId} is explicitly blocked: ${blocker}.`);
      }
    }
  }

  const previewItems = orderedTasks.map((task) => ({
    id: task.id,
    title: task.title,
    column: task.column,
    selected: selected.has(task.id),
    dependencyDepth: depthByTask.get(task.id) ?? 0,
    dependencyIds: task.dependencies?.blocked_by ?? [],
    blockers: blockersByTask.get(task.id) ?? [],
  }));

  const omittedTaskIds = input.tasks.map((task) => task.id).filter((id) => !orderedTaskSet.has(id));

  return {
    mode: input.mode,...(input.traceId ? { traceId: input.traceId } : {}),
    targetTaskIds: targetIds,
    orderedTaskIds,
    tasks: previewItems,
    omittedTaskIds,
    missingTaskIds: [...missing],
    warnings,
    requiresDisclosure: true,
    blocked: missing.size > 0 || [...blockersByTask.values()].some((blockers) => blockers.length > 0),
  };

  function collectDependencies(taskId: string, depth: number): void {
    const task = taskMap.get(taskId);
    if (!task) {
      missing.add(taskId);
      return;
    }

    if (!included.has(taskId)) {
      inclusionOrder.push(taskId);
      included.add(taskId);
    }
    const currentDepth = depthByTask.get(taskId);
    if (currentDepth === undefined || depth < currentDepth) {
      depthByTask.set(taskId, depth);
    }

    if (task.blockedBy?.trim()) {
      addTaskBlocker(task.id, `task is blocked by ${task.blockedBy.trim()}`);
    }

    for (const dependencyId of task.dependencies?.blocked_by ?? []) {
      if (!taskMap.has(dependencyId)) {
        missing.add(dependencyId);
        addTaskBlocker(taskId, `missing dependency: ${dependencyId}`);
        continue;
      }
      collectDependencies(dependencyId, depth + 1);
    }
  }

  function addTaskBlocker(taskId: string, blocker: string): void {
    const existing = blockersByTask.get(taskId) ?? [];
    if (!existing.includes(blocker)) {
      blockersByTask.set(taskId, [...existing, blocker]);
    }
  }

  function countDependencyTree(taskId: string, visited = new Set<string>): number {
    const task = taskMap.get(taskId);
    if (!task) return 0;

    let count = 0;
    for (const dependencyId of task.dependencies?.blocked_by ?? []) {
      if (visited.has(dependencyId)) continue;
      visited.add(dependencyId);
      count += 1;
      count += countDependencyTree(dependencyId, visited);
    }
    return count;
  }
}

function getSynchronousCompletionBlocker(task: DependencyRunPreviewTask): string | undefined {
  return task.blockedBy?.trim()
    ? `task is blocked by ${task.blockedBy.trim()}`
    : undefined;
}
