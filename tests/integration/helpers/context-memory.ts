import type {
  ContextPackRepositoryPort,
  ProjectRepositoryPort,
  TaskRepositoryPort
} from "@fulcrum/core";
import type { ContextItem, ContextPack, Project, Task } from "@fulcrum/shared";

export class MemoryContextRepository implements ContextPackRepositoryPort {
  packs = new Map<string, ContextPack>();
  items = new Map<string, ContextItem>();
  savePack(pack: ContextPack): ContextPack {
    this.packs.set(pack.contextPackId, pack);
    return pack;
  }
  saveItems(items: ContextItem[]): ContextItem[] {
    for (const item of items) this.items.set(item.contextItemId, item);
    return items;
  }
  getPack(contextPackId: string): ContextPack | undefined {
    return this.packs.get(contextPackId);
  }
  listItems(contextPackId: string): ContextItem[] {
    return [...this.items.values()].filter((item) => item.contextPackId === contextPackId);
  }
}

export class MemoryProjectRepository implements ProjectRepositoryPort {
  projects = new Map<string, Project>();
  save(project: Project): Project {
    this.projects.set(project.projectId, project);
    return project;
  }
  get(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }
  findByRoot(rootPath: string): Project | undefined {
    return [...this.projects.values()].find((project) => project.rootPath === rootPath);
  }
  list(): Project[] {
    return [...this.projects.values()];
  }
}

export class MemoryTaskRepository implements TaskRepositoryPort {
  tasks = new Map<string, Task>();
  save(task: Task): Task {
    this.tasks.set(task.taskId, task);
    return task;
  }
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }
  list(projectId?: string): Task[] {
    return [...this.tasks.values()].filter((task) => !projectId || task.projectId === projectId);
  }
}
