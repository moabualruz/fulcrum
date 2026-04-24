import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LocalTaskService,
  ProjectRegistryService,
  buildQueueSummary,
  type ProjectRepositoryPort,
  type TaskRepositoryPort
} from "@fulcrum/core";
import type { Project, Task } from "@fulcrum/shared";

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

describe("local PM-free task workflow", () => {
  it("creates tasks and enforces SRS task transitions", () => {
    const projectRepo = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const projects = new ProjectRegistryService(projectRepo, tasks);
    const rootPath = mkdtempSync(path.join(tmpdir(), "fulcrum-task-project-"));
    const project = projects.register({ rootPath });

    const task = tasks.create({ projectId: project.projectId, title: "Ship local board" });
    const ready = tasks.transition(task.taskId, "ready");

    expect(task.status).toBe("pending");
    expect(ready.status).toBe("ready");
    expect(() => tasks.transition(task.taskId, "completed")).toThrow(/Invalid task transition/);
  });

  it("builds blocker and review queues from canonical local tasks", () => {
    const projectRepo = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const projects = new ProjectRegistryService(projectRepo, tasks);
    const project = projects.register({
      rootPath: mkdtempSync(path.join(tmpdir(), "fulcrum-queue-project-"))
    });

    const blocked = tasks.create({ projectId: project.projectId, title: "Blocked task" });
    tasks.transition(blocked.taskId, "ready");
    tasks.transition(blocked.taskId, "running");
    tasks.transition(blocked.taskId, "blocked");
    tasks.create({ projectId: project.projectId, title: "Merge-ready task", labels: ["merge"] });

    const summary = buildQueueSummary(projects.list(), tasks.list());

    expect(summary.blockers).toHaveLength(1);
    expect(summary.merge).toHaveLength(1);
    expect(projects.overview()[0]?.counts.blockers).toBe(1);
    expect(projects.overview()[0]?.counts.merge).toBe(1);
  });
});
