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
  list(_projectId?: string): ExternalWorkItemMirror[] {
    return [...this.mirrors.values()];
  }
}

describe("Plane full acceptance", () => {
  it("covers connect, doctor, import, sync, link, writeback, docs memory provenance, outage recovery, and local history", async () => {
    const tasks = new MemoryTaskRepository();
    const mirrors = new MemoryMirrorRepository();
    const adapter = new SimulatedPlaneAdapter([
      {
        externalId: "PLN-42",
        title: "Plane acceptance",
        body: "Remote page body",
        status: "in progress",
        updatedAt: new Date(0).toISOString(),
        url: "https://plane.example/PLN-42",
        docs: [
          {
            title: "Design page",
            url: "plane://pages/design",
            updatedAt: new Date(0).toISOString()
          }
        ]
      }
    ]);
    const service = new ExternalPmService(mirrors, tasks, adapter, {
      get: (projectId: string) => ({ projectId })
    });
    const localTaskService = new LocalTaskService(tasks);

    const health = await adapter.healthCheck();
    const imported = await service.importWork({ projectId: "proj_plane" });
    const linkedTask = localTaskService.create({
      projectId: "proj_plane",
      title: "Local linked execution",
      description: "Local history must stay canonical"
    });
    const linked = service.linkTask({ mirrorId: imported[0]!.mirrorId, taskId: linkedTask.taskId });
    const preview = await service.previewWriteback({
      mirrorId: linked.mirrorId,
      externalId: linked.externalId,
      comment: "Ready from Fulcrum",
      status: "done"
    });
    const written = await service.decideWriteback({
      mirrorId: linked.mirrorId,
      decision: "approve",
      policyDecisionId: "pol_approved",
      comment: "Ready from Fulcrum",
      status: "done"
    });
    const sync = service.syncStatus("proj_plane");
    await adapter.disable("Plane outage");
    const outage = await service.importWork({ projectId: "proj_plane" });
    const disabled = await service.disable("operator disabled during outage");

    expect(health.state).toBe("managed");
    expect(imported[0]).toMatchObject({ sourceStatus: "in progress", syncStatus: "synced" });
    expect(tasks.get(imported[0]!.taskId)?.status).toBe("running");
    expect(linked.taskId).toBe(linkedTask.taskId);
    expect(preview.adapterPreview.dataSharedExternally).toEqual(["Ready from Fulcrum", "done"]);
    expect(preview.policyDecision.status).toBe("approval_required");
    expect(written.syncStatus).toBe("synced");
    expect(sync[0]?.nextAction).toBe("No action required.");
    expect(imported[0]!.provenance.docs).toEqual([
      { title: "Design page", url: "plane://pages/design", updatedAt: new Date(0).toISOString() }
    ]);
    expect(outage[0]?.syncStatus).toBe("failed");
    expect(disabled[0]?.syncStatus).toBe("disabled");
    expect(tasks.get(linkedTask.taskId)?.descriptionSnapshot).toBe(
      "Local history must stay canonical"
    );
  });

  it("maps Plane states to Fulcrum task status", () => {
    expect(mapExternalStatus("todo")).toBe("pending");
    expect(mapExternalStatus("in progress")).toBe("running");
    expect(mapExternalStatus("review")).toBe("review");
    expect(mapExternalStatus("done")).toBe("completed");
  });
});
