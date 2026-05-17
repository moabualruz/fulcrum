import { describe, expect, test } from "bun:test";

import {
  createWorkerRegistry,
  WorkerTaskAlreadyRegisteredError,
} from "@platform-core/application/jobs/registry.ts";
import { ARTIFACT_HARVEST_TASK } from "@workflow-coordination/infrastructure/artifacts/worker.ts";
import { NOTIFY_FANOUT_TASK } from "@notification-center/application/delivery-runtime/fanout-worker.ts";
import { REPO_SYNC_LOCAL_TASK } from "@integration-hub/application/repos/workers/sync-local.ts";
import { REPO_SYNC_REMOTE_TASK } from "@integration-hub/application/repos/workers/sync-remote.ts";

describe("worker registry", () => {
  test("registers a task with payload assertion and async handler", async () => {
    const registry = createWorkerRegistry();
    const calls: Array<{ repoId: string }> = [];

    registry.registerTask(
      "repo.sync.local",
      (payload): asserts payload is { repoId: string } => {
        if (!payload || typeof payload !== "object" || typeof (payload as { repoId?: unknown }).repoId !== "string") {
          throw new Error("repoId required");
        }
      },
      async (payload) => {
        calls.push(payload);
      },
    );

    await registry.runTask("repo.sync.local", { repoId: "repo_01" }, { job: { id: "job_01" } });

    expect(registry.getTask("repo.sync.local")?.name).toBe("repo.sync.local");
    expect(registry.listTasks().map((task) => task.name)).toEqual(["repo.sync.local"]);
    expect(calls).toEqual([{ repoId: "repo_01" }]);
  });

  test("rejects duplicate task names", () => {
    const registry = createWorkerRegistry();
    registry.registerTask("artifact.harvest", assertObjectPayload, async () => undefined);

    expect(() =>
      registry.registerTask("artifact.harvest", assertObjectPayload, async () => undefined)
    ).toThrow(WorkerTaskAlreadyRegisteredError);
  });

  test("asserts payload before handler runs", async () => {
    const registry = createWorkerRegistry();
    let handlerCalled = false;

    registry.registerTask(
      "notify-fan-out",
      () => {
        throw new Error("eventId required");
      },
      async () => {
        handlerCalled = true;
      },
    );

    await expect(registry.runTask("notify-fan-out", {}, {})).rejects.toThrow("eventId required");
    expect(handlerCalled).toBe(false);
  });

  test("awaits handler promises and reports handler rejection", async () => {
    const registry = createWorkerRegistry();
    const failure = new Error("queue unavailable");
    const order: string[] = [];

    registry.registerTask("notify-fan-out", assertObjectPayload, async () => {
      await Promise.resolve();
      order.push("handler awaited");
      throw failure;
    });

    await expect(registry.runTask("notify-fan-out", { eventId: "event_01" }, {})).rejects.toBe(failure);
    expect(order).toEqual(["handler awaited"]);
  });

  test("supports existing worker task names without changing payload contracts", () => {
    const registry = createWorkerRegistry();

    registry.registerTask(ARTIFACT_HARVEST_TASK, assertObjectPayload, async () => undefined);
    registry.registerTask(NOTIFY_FANOUT_TASK, assertObjectPayload, async () => undefined);
    registry.registerTask(REPO_SYNC_LOCAL_TASK, assertObjectPayload, async () => undefined);
    registry.registerTask(REPO_SYNC_REMOTE_TASK, assertObjectPayload, async () => undefined);

    expect(registry.listTasks().map((task) => task.name)).toEqual([
      ARTIFACT_HARVEST_TASK,
      NOTIFY_FANOUT_TASK,
      REPO_SYNC_LOCAL_TASK,
      REPO_SYNC_REMOTE_TASK,
    ]);
  });
});

function assertObjectPayload(payload: unknown): asserts payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object") throw new Error("object payload required");
}
