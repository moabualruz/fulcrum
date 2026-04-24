import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ContextPackBuilder,
  FileContextPackRepository,
  FileWorkRepository,
  LocalTaskService,
  ProjectRegistryService,
  type ContextPackRepositoryPort,
  type ProjectRepositoryPort,
  type TaskRepositoryPort
} from "@fulcrum/core";
import type { ContextItem, ContextPack, Project, Task } from "@fulcrum/shared";

class MemoryContextRepository implements ContextPackRepositoryPort {
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

class MemoryProjectRepository implements ProjectRepositoryPort {
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

class MemoryTaskRepository implements TaskRepositoryPort {
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

describe("offline context build", () => {
  it("builds task, memory, code, and policy lanes without network", () => {
    const projects = new ProjectRegistryService(new MemoryProjectRepository());
    const tasks = new LocalTaskService(new MemoryTaskRepository());
    const project = projects.register({ rootPath: process.cwd(), name: "Fulcrum" });
    const task = tasks.create({
      projectId: project.projectId,
      title: "Build context",
      description: "Use README.md and local policy evidence."
    });
    const builder = new ContextPackBuilder(new MemoryContextRepository(), tasks, projects);

    const result = builder.build({ taskId: task.taskId, offline: true, budget: 8000 });

    expect(result.pack.status).toBe("ready");
    expect(result.pack.budgetUsed).toBeGreaterThan(0);
    expect(result.items.map((item) => item.lane)).toEqual(
      expect.arrayContaining(["task", "memory", "code", "policy"])
    );
    for (const item of result.items) {
      expect(item.sourceRef.uri).toBeTruthy();
      expect(item.inclusionReason).toBeTruthy();
      expect(item.freshness).toBeTruthy();
      expect(item.redactionStatus).toBeTruthy();
    }
  });

  it("replaces stale file-backed items when a pack is rebuilt with fewer lanes", () => {
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "fulcrum-context-"));
    try {
      const projects = new ProjectRegistryService(new MemoryProjectRepository());
      const tasks = new LocalTaskService(new MemoryTaskRepository());
      const project = projects.register({ rootPath: stateDir, name: "Fulcrum" });
      const task = tasks.create({
        projectId: project.projectId,
        title: "Rebuild context",
        description: "Trim old lanes."
      });
      const repository = new FileContextPackRepository(
        new FileWorkRepository(path.join(stateDir, "work-state.json"))
      );
      const builder = new ContextPackBuilder(repository, tasks, projects);
      const now = new Date(0).toISOString();

      const first = builder.build({ taskId: task.taskId, now });
      builder.build({ taskId: task.taskId, lanes: ["task"], now });

      expect(repository.listItems(first.pack.contextPackId).map((item) => item.lane)).toEqual([
        "task"
      ]);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
