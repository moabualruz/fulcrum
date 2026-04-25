import { describe, expect, it } from "vitest";
import {
  ExternalPmService,
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
  list(): Task[] {
    return [...this.tasks.values()];
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

describe("external writeback policy", () => {
  it("requires preview and operator approval before externally visible writeback", async () => {
    const service = new ExternalPmService(
      new MemoryMirrorRepository(),
      new MemoryTaskRepository(),
      new SimulatedPlaneAdapter([{ externalId: "PLN-2", title: "Writeback target" }]),
      { get: (projectId: string) => ({ projectId }) }
    );
    await service.importWork({ projectId: "proj_local" });

    const preview = await service.previewWriteback({
      externalId: "PLN-2",
      comment: "Run completed",
      status: "done"
    });

    expect(preview.adapterPreview.externalVisibility).toBe("remote");
    expect(preview.policyDecision.action).toBe("external_writeback");
    expect(preview.policyDecision.status).toBe("approval_required");
    expect(preview.mirror).toMatchObject({
      externalId: "PLN-2",
      syncStatus: "synced"
    });
    expect(preview.previewId).toMatch(/^preview_/);
  });
});
