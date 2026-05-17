import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  WorkContextController,
  WorkContextTraceParamsDto,
  WorkContextTraceRequestDto,
} from "@workflow-coordination/interface/http/work-context.controller.ts";
import {
  type WorkContextPersistenceSummary,
  type WorkContextTraceInput,
} from "@workflow-coordination/application/work-context-persistence.service.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

function validContextTrace(): WorkContextTraceInput {
  return {
    projectId: "project-context-api",
    traceId: "trace-context-api",
    taskId: "task-context-api",
    runId: "run-context-api",
    contextBundle: {
      id: "context-api",
      purpose: "acp_planning",
      sourceRefs: [
        { kind: "doc", id: "doc-context-api", role: "freeform" },
        { kind: "memory", id: "memory-context-api", role: "durable_decision" },
      ],
      bundleJson: { prompt: "Plan from copied freeform docs." },
      tokenCount: 256,
      sourceCounts: { docs: 1, memories: 1 },
    },
    memory: {
      id: "memory-context-api",
      scope: "project",
      kind: "decision",
      body: "Use deterministic context bundles for ACP planning.",
      tags: ["acp", "context"],
      importance: "high",
      source: "manual",
      sourceRef: { path: "workflow-replacement-plan.md" },
    },
    memoryLinks: [
      {
        id: "memory-link-context-api",
        targetKind: "task",
        targetId: "task-context-api",
      },
    ],
    runEvents: [
      {
        id: "run-event-context-api",
        sequence: 1,
        domain: "executor",
        mutationType: "context:bundle-created",
        targetKind: "context_bundle",
        targetId: "context-api",
        agentId: "codex",
        taskLineageId: "lineage-context-api",
        payload: { phase: "planning" },
      },
    ],
  };
}

describe("Work context Nest controller", () => {
  test("is wired as a Nest API controller on the workflows module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowCycleModule) as unknown[];

    expect(controllers).toContain(WorkContextController);
    expect(Reflect.getMetadata(PATH_METADATA, WorkContextController)).toBe(
      "workflows/context",
    );
    expect(Reflect.getMetadata(PATH_METADATA, WorkContextController.prototype.persistContextTrace)).toBe(
      "context-traces",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, WorkContextController.prototype.persistContextTrace)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, WorkContextController.prototype.loadContextTrace)).toBe(
      "context-traces/:traceId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, WorkContextController.prototype.loadContextTrace)).toBe(
      RequestMethod.GET,
    );
  });

  test("delegates context persistence and trace loading to the server-owned TypeORM service", async () => {
    const input = validContextTrace();
    const summary: WorkContextPersistenceSummary = {
      traceId: input.traceId,
      projectId: input.projectId,
      contextBundleIds: [input.contextBundle.id],
      memoryIds: [input.memory.id],
      memoryLinks: [{ targetKind: "task", targetId: "task-context-api" }],
      runEvents: [
        {
          id: "run-event-context-api",
          runId: "run-context-api",
          sequence: 1,
          domain: "executor",
          mutationType: "context:bundle-created",
          targetKind: "context_bundle",
          targetId: "context-api",
        },
      ],
    };
    const service = {
      persisted: undefined as WorkContextTraceInput | undefined,
      async persistContextTrace(contextTrace: WorkContextTraceInput) {
        this.persisted = contextTrace;
      },
      async loadContextTrace(traceId: string) {
        expect(traceId).toBe("trace-context-api");
        return summary;
      },
    };
    const controller = new WorkContextController(service);

    await expect(controller.persistContextTrace(input)).resolves.toEqual({
      contextBundleId: "context-api",
      memoryId: "memory-context-api",
      runEventIds: ["run-event-context-api"],
      status: "persisted",
      traceId: "trace-context-api",
    });
    expect(service.persisted).toBe(input);
    await expect(controller.loadContextTrace({ traceId: "trace-context-api" })).resolves.toEqual(summary);
  });

  test("keeps request validation at the Nest boundary", () => {
    const request = Object.assign(new WorkContextTraceRequestDto(), validContextTrace());
    const params = Object.assign(new WorkContextTraceParamsDto(), { traceId: "trace-context-api" });
    const invalid = Object.assign(new WorkContextTraceParamsDto(), { traceId: "" });

    expect(validateSync(request)).toEqual([]);
    expect(validateSync(params)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property)).toEqual(["traceId"]);
  });
});
