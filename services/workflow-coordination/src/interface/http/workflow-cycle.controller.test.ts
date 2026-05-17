import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  WorkflowCycleController,
  WorkflowAcceptanceCycleRequestDto,
  WorkflowCycleCycleRequestDto,
  WorkflowCycleTraceParamsDto,
} from "@workflow-coordination/interface/http/workflow-cycle.controller.ts";
import {
  type WorkflowAcceptanceCycleInput,
  type WorkflowAcceptanceCycleResult,
} from "@workflow-coordination/application/workflow-acceptance-cycle.ts";
import {
  type WorkflowCycleCycleInput,
  type WorkflowCycleTraceSummary,
} from "@workflow-coordination/application/workflow-cycle-persistence.service.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

function validCycle(): WorkflowCycleCycleInput {
  return {
    workspace: { id: "workspace-api", slug: "api", name: "API workspace" },
    project: {
      id: "project-api",
      slug: "api-cycle",
      name: "API cycle",
      traceId: "trace-api",
    },
    freeformDoc: {
      id: "doc-api",
      title: "Freeform API request",
      bodyMd: "Start from freeform docs, then plan through ACP.",
    },
    planningTask: {
      id: "task-api-plan",
      title: "Plan",
      status: "done",
      successCriteria: ["prototype approved"],
    },
    executionTask: {
      id: "task-api-run",
      title: "Run dependencies",
      status: "in_review",
      successCriteria: ["QA closed"],
      dependsOnTaskId: "task-api-plan",
    },
    plan: {
      id: "plan-api",
      title: "API plan",
      planMd: "# Plan",
      status: "approved",
    },
    prototype: {
      id: "prototype-api",
      artifactId: "artifact-api-prototype",
      title: "Prototype",
      outputRef: "artifacts/prototype.md",
    },
    review: {
      id: "review-api",
      type: "code",
      status: "approved",
      annotationId: "annotation-api",
    },
    uat: {
      id: "uat-api",
      status: "approved",
      finalQaEventId: "event-api-final-qa",
    },
    generatedE2E: {
      id: "e2e-api",
      runner: "bun",
      filePath: "tests/e2e/generated/api-cycle.test.ts",
      bodyMd: "Regression test from approved UAT.",
    },
  };
}

function validAcceptanceCycle(): WorkflowAcceptanceCycleInput {
  return {
    workspace: { id: "workspace-acceptance-api", slug: "acceptance-api", name: "Acceptance API" },
    project: {
      id: "project-acceptance-api",
      slug: "acceptance-api",
      name: "Acceptance API",
      traceId: "trace-acceptance-api",
    },
    freeform: {
      documentId: "doc-acceptance-api",
      title: "Start from freeform docs",
      bodyMd: "Use freeform docs as planning context, execute dependencies, and generate E2E coverage.",
      userPrompt: "Build a technical plan and run it to UAT approval.",
    },
    guidedPlanning: {
      acpSessionId: "acp-acceptance-api",
      agentName: "codex",
      cwd: "/Users/mkh/workspace/fulcrum",
      modeId: "planning",
      modelId: "gpt-5.4",
      permissionMode: "review_each_tool",
    },
    approvedPlan: {
      planId: "plan-acceptance-api",
      reviewId: "review-acceptance-api",
      markdown: "# Plan\n\n## Tasks\n- [context] Preserve context\n\n## Success Criteria\n- User approval is codified.",
    },
    execution: {
      agent: "codex",
      model: "gpt-5.4",
      prompt: "Run the dependency tree.",
      lifecycleSummary: "All success criteria passed.",
      qaReviewText: "### Verdict: APPROVE\nAll success criteria passed.",
      qaReviewType: "code",
    },
    uat: {
      decision: "approve_without_manual_review",
      reviewType: "uat",
      e2eRunner: "bun",
    },
  };
}

describe("Workflow cycle Nest controller", () => {
  test("is wired as a Nest API controller on the workflows module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowCycleModule) as unknown[];

    expect(controllers).toContain(WorkflowCycleController);
    expect(Reflect.getMetadata(PATH_METADATA, WorkflowCycleController)).toBe("workflows/cycles");
    expect(Reflect.getMetadata(PATH_METADATA, WorkflowCycleController.prototype.persistCycle)).toBe("cycles");
    expect(Reflect.getMetadata(METHOD_METADATA, WorkflowCycleController.prototype.persistCycle)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, WorkflowCycleController.prototype.loadTraceSummary)).toBe(
      "traces/:traceId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, WorkflowCycleController.prototype.loadTraceSummary)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, WorkflowCycleController.prototype.runAcceptanceCycle)).toBe(
      "acceptance-cycle/run",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, WorkflowCycleController.prototype.runAcceptanceCycle)).toBe(
      RequestMethod.POST,
    );
  });

  test("delegates persistence and trace loading to the server-owned TypeORM service", async () => {
    const input = validCycle();
    const summary: WorkflowCycleTraceSummary = {
      traceId: input.project.traceId,
      workspaceId: input.workspace.id,
      projectId: input.project.id,
      documentIds: [input.freeformDoc.id],
      taskIds: [input.planningTask.id, input.executionTask.id],
      dependencyEdges: [{ taskId: input.executionTask.id, dependsOnTaskId: input.planningTask.id }],
      planIds: [input.plan.id],
      prototypeIds: [input.prototype.id],
      reviewSessionIds: [input.review.id],
      uatSessionIds: [input.uat.id],
      generatedE2ETestIds: [input.generatedE2E.id],
      artifactIds: [input.prototype.artifactId],
      agentRunIds: [`run-${input.executionTask.id.replace(/^task-/, "")}`],
    };
    const service = {
      persisted: undefined as WorkflowCycleCycleInput | undefined,
      async persistCycle(cycle: WorkflowCycleCycleInput) {
        this.persisted = cycle;
      },
      async loadTraceSummary(traceId: string) {
        expect(traceId).toBe("trace-api");
        return summary;
      },
    };
    const controller = new WorkflowCycleController(service, { async runCycle() {
      throw new Error("runCycle should not be called by persistence methods.");
    } });

    await expect(controller.persistCycle(input)).resolves.toEqual({
      traceId: "trace-api",
      status: "persisted",
    });
    expect(service.persisted).toBe(input);
    await expect(controller.loadTraceSummary({ traceId: "trace-api" })).resolves.toEqual(summary);
  });

  test("delegates the full acceptance cycle to the server-owned workflow service", async () => {
    const input = validAcceptanceCycle();
    const result = {
      traceId: input.project.traceId,
    } as WorkflowAcceptanceCycleResult;
    const acceptance = {
      received: undefined as WorkflowAcceptanceCycleInput | undefined,
      async runCycle(cycle: WorkflowAcceptanceCycleInput) {
        this.received = cycle;
        return result;
      },
    };
    const controller = new WorkflowCycleController({
      async persistCycle() {
        throw new Error("persistCycle should not be called by acceptance cycle action.");
      },
      async loadTraceSummary() {
        throw new Error("loadTraceSummary should not be called by acceptance cycle action.");
      },
    }, acceptance);

    await expect(controller.runAcceptanceCycle(input)).resolves.toBe(result);
    expect(acceptance.received).toBe(input);
  });

  test("keeps request validation at the Nest boundary", () => {
    const request = Object.assign(new WorkflowCycleCycleRequestDto(), validCycle());
    const acceptanceRequest = Object.assign(new WorkflowAcceptanceCycleRequestDto(), validAcceptanceCycle());
    const params = Object.assign(new WorkflowCycleTraceParamsDto(), { traceId: "trace-api" });
    const invalid = Object.assign(new WorkflowCycleTraceParamsDto(), { traceId: "" });

    expect(validateSync(request)).toEqual([]);
    expect(validateSync(acceptanceRequest)).toEqual([]);
    expect(validateSync(params)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property)).toEqual(["traceId"]);
  });
});
