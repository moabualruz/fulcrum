import { describe, expect, it } from "vitest";
import {
  ExternalPmService,
  LocalTaskService,
  mapExternalStatus,
  type ExternalWorkItemMirrorRepositoryPort,
  type TaskRepositoryPort
} from "@fulcrum/core";
import { SimulatedPlaneAdapter } from "../../packages/plane/src/simulated-adapter.js";
import type { ExternalWorkItemMirror, Task } from "@fulcrum/shared";

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

class MemoryMirrorRepository implements ExternalWorkItemMirrorRepositoryPort {
  mirrors = new Map<string, ExternalWorkItemMirror>();
  save(mirror: ExternalWorkItemMirror): ExternalWorkItemMirror {
    this.mirrors.set(mirror.mirrorId, mirror);
    return mirror;
  }
  get(mirrorId: string): ExternalWorkItemMirror | undefined {
    return this.mirrors.get(mirrorId);
  }
  findByExternal(adapterId: string, externalId: string): ExternalWorkItemMirror | undefined {
    return [...this.mirrors.values()].find(
      (mirror) => mirror.adapterId === adapterId && mirror.externalId === externalId
    );
  }
  list(): ExternalWorkItemMirror[] {
    return [...this.mirrors.values()];
  }
}

const projectRepo = { get: (projectId: string) => ({ projectId }) };

describe("Plane mirror sync", () => {
  it("imports work, maps status, stores docs provenance, and preserves local tasks after disable", async () => {
    const taskRepo = new MemoryTaskRepository();
    const mirrorRepo = new MemoryMirrorRepository();
    const service = new ExternalPmService(
      mirrorRepo,
      taskRepo,
      new SimulatedPlaneAdapter([
        {
          externalId: "PLN-1",
          title: "Implement mirror",
          body: "Remote body",
          status: "review",
          updatedAt: new Date(0).toISOString(),
          docs: [{ title: "Spec page", url: "plane://PLN-1/docs" }]
        }
      ]),
      projectRepo
    );

    const mirrors = await service.importWork({ projectId: "proj_local" });
    const task = taskRepo.get(mirrors[0]!.taskId);
    const disabled = await service.disable("adapter outage");

    expect(mirrors).toHaveLength(1);
    expect(task?.status).toBe("review");
    expect(mirrors[0]!.syncStatus).toBe("synced");
    expect(mirrors[0]!.provenance.docs).toEqual([
      { title: "Spec page", url: "plane://PLN-1/docs" }
    ]);
    expect(disabled[0]!.syncStatus).toBe("disabled");
    expect(taskRepo.list("proj_local")).toHaveLength(1);
  });

  it("maps known external statuses to local task lifecycle states", () => {
    expect(mapExternalStatus("todo")).toBe("pending");
    expect(mapExternalStatus("in progress")).toBe("running");
    expect(mapExternalStatus("done")).toBe("completed");
  });

  it("rejects imports for unknown local projects", async () => {
    const service = new ExternalPmService(
      new MemoryMirrorRepository(),
      new MemoryTaskRepository(),
      new SimulatedPlaneAdapter([{ externalId: "PLN-4", title: "Orphan blocker" }]),
      { get: () => undefined }
    );

    await expect(service.importWork({ projectId: "proj_missing" })).rejects.toThrow(
      /Project not found/
    );
  });
});
