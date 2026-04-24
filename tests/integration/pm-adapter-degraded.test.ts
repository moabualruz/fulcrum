import { describe, expect, it } from "vitest";
import {
  ExternalPmService,
  externalPmHealth,
  type ExternalWorkItemMirrorRepositoryPort,
  type TaskRepositoryPort
} from "@fulcrum/core";
import { SimulatedPlaneAdapter } from "@fulcrum/plane";
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

describe("PM adapter degraded behavior", () => {
  it("marks mirrors disabled while local task history remains usable", async () => {
    const adapter = new SimulatedPlaneAdapter([{ externalId: "PLN-3", title: "Keep local" }]);
    const taskRepo = new MemoryTaskRepository();
    const service = new ExternalPmService(new MemoryMirrorRepository(), taskRepo, adapter, {
      get: (projectId: string) => ({ projectId })
    });
    await service.importWork({ projectId: "proj_local" });

    const disabled = await service.disable("network unavailable");
    const health = await externalPmHealth(adapter);

    expect(disabled[0]!.syncStatus).toBe("disabled");
    expect(taskRepo.list("proj_local")).toHaveLength(1);
    expect(health.state).toBe("disabled");
    expect(health.blocking).toBe(false);
  });

  it("records failed sync status when adapter import throws", async () => {
    const adapter = new SimulatedPlaneAdapter([{ externalId: "PLN-5", title: "Failure target" }]);
    const mirrorRepo = new MemoryMirrorRepository();
    const taskRepo = new MemoryTaskRepository();
    const service = new ExternalPmService(mirrorRepo, taskRepo, adapter, {
      get: (projectId: string) => ({ projectId })
    });
    await service.importWork({ projectId: "proj_local" });
    await adapter.disable("outage");

    const failed = await service.importWork({ projectId: "proj_local" });

    expect(failed[0]!.syncStatus).toBe("failed");
    expect(failed[0]!.lastFailure).toMatch(/disabled/);
  });
});
