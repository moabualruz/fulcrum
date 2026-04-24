import { describe, expect, it } from "vitest";
import { ContextPackBuilder, LocalTaskService, ProjectRegistryService } from "@fulcrum/core";
import {
  MemoryContextRepository,
  MemoryProjectRepository,
  MemoryTaskRepository
} from "./helpers/context-memory.js";

describe("context degraded lanes", () => {
  it("marks unavailable memory and code lanes degraded while keeping fallback evidence", () => {
    const projectRepo = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const projects = new ProjectRegistryService(projectRepo);
    const tasks = new LocalTaskService(taskRepo);
    const project = projects.register({ rootPath: process.cwd() });
    const task = tasks.create({ projectId: project.projectId, title: "Offline degraded lanes" });
    const builder = new ContextPackBuilder(new MemoryContextRepository(), tasks, projects);

    const result = builder.build({
      taskId: task.taskId,
      memoryAvailable: false,
      codeAvailable: false,
      offline: true
    });

    expect(result.pack.status).toBe("degraded");
    expect(result.pack.degradedLanes.map((lane) => lane.lane)).toEqual(
      expect.arrayContaining(["memory", "code"])
    );
    expect(result.items.some((item) => item.evidenceType === "path")).toBe(true);
  });
});
