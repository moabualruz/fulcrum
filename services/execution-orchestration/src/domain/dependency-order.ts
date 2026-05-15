export const COLUMNS = ["triage", "todo", "in-progress", "in-review", "done", "archived"] as const;
export type Column = (typeof COLUMNS)[number];

export const VALID_TRANSITIONS: Record<Column, Column[]> = {
  triage: ["todo"],
  todo: ["in-progress", "triage"],
  "in-progress": ["in-review", "todo", "triage", "done"],
  "in-review": ["done", "in-progress", "todo", "triage"],
  done: ["todo", "triage", "archived"],
  archived: ["done"],
};

export interface DependencyOrderTask {
  id: string;
  dependencies: string[];
}

export function canTransition(from: Column, to: Column): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function getValidTransitions(column: Column): Column[] {
  return [...VALID_TRANSITIONS[column]];
}

export function resolveDependencyOrder(tasks: DependencyOrderTask[]): string[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const ordered: string[] = [];
  const visited = new Set<string>;
  const visiting = new Set<string>;

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dependencyId of task.dependencies) {
        if (taskMap.has(dependencyId)) visit(dependencyId);
      }
    }

    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  }

  for (const task of tasks) visit(task.id);
  return ordered;
}
