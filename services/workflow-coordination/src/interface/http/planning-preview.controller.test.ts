import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  PlanningApprovedPlanRequestDto,
  PlanningContinuousUpdateRequestDto,
  PlanningFreeformPromptRequestDto,
  PlanningFreeformStartRequestDto,
  PlanningGuidedAcpStartRequestDto,
  PlanningMaterializeRequestDto,
  PlanningPreviewController,
  PlanningTechnicalCycleRequestDto,
} from "@workflow-coordination/interface/http/planning-preview.controller.ts";
import {
  PlanningPreviewService,
  type ApprovedPlanPreview,
  type ApprovedPlanMaterializeResult,
  type PlanningFreeformPromptResult,
  type PlanningFreeformStartResult,
  type PlanningGuidedAcpStartResult,
  type PlanningContinuousUpdateResult,
  type PlanningTechnicalCycleResult,
} from "@workflow-coordination/application/planning-preview.service.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

function validApprovedPlanInput(): PlanningApprovedPlanRequestDto {
  return Object.assign(new PlanningApprovedPlanRequestDto(), {
    planId: "plan-nest-preview",
    approvedPlanMarkdown: [
      "# Agent-native docs workflow",
      "",
      "## Tasks",
      "- [docs] Build freeform context",
      "  Depends on: none",
      "- [acp] Start ACP planning session",
      "  Depends on: docs",
      "",
      "## Prototype / Boilerplate",
      "- [prototype] apps/web/src/routes/planning/+page.svelte",
      "",
      "## Success Criteria",
      "- Freeform docs feed ACP planning.",
    ].join("\n"),
    projectId: "project-nest",
    traceId: "trace-nest",
    reviewId: "review-nest",
    sourceDocRefs: [{ id: "doc-source", title: "Original prompt" }],
  });
}

describe("Planning preview Nest controller", () => {
  test("is wired as a Nest API controller on the workflows module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowCycleModule) as unknown[];

    expect(controllers).toContain(PlanningPreviewController);
    expect(Reflect.getMetadata(PATH_METADATA, PlanningPreviewController)).toBe("workflows/planning");
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.previewApprovedPlan),
    ).toBe("approved-plan/preview");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.previewApprovedPlan),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.materializeApprovedPlan),
    ).toBe("approved-plan/materialize");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.materializeApprovedPlan),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.buildFreeformDocsPlanningPrompt),
    ).toBe("freeform/prompt");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.buildFreeformDocsPlanningPrompt),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.generateTechnicalPlanningCycle),
    ).toBe("technical-cycle/generate");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.generateTechnicalPlanningCycle),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.startFreeformWork),
    ).toBe("freeform/start");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.startFreeformWork),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.startGuidedAcpPlanning),
    ).toBe("guided-acp/start");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.startGuidedAcpPlanning),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, PlanningPreviewController.prototype.restartPlanningCycleFromUpdates),
    ).toBe("continuous-update/restart");
    expect(
      Reflect.getMetadata(METHOD_METADATA, PlanningPreviewController.prototype.restartPlanningCycleFromUpdates),
    ).toBe(RequestMethod.POST);
  });

  test("delegates approved-plan preview to the server-owned planning service", async () => {
    const input = validApprovedPlanInput();
    const preview: ApprovedPlanPreview = {
      title: "Agent-native docs workflow",
      docs: [],
      artifacts: [],
      successCriteria: [],
      taskDrafts: [],
      dependencyUpdates: [],
      warnings: [],
    };
    const service = {
      seen: undefined as PlanningApprovedPlanRequestDto | undefined,
      async previewApprovedPlan(body: PlanningApprovedPlanRequestDto) {
        this.seen = body;
        return preview;
      },
      async materializeApprovedPlan() {
        throw new Error("unexpected materialize call");
      },
      async buildFreeformDocsPlanningPrompt() {
        throw new Error("unexpected freeform prompt call");
      },
      async generateTechnicalPlanningCycle() {
        throw new Error("unexpected technical planning call");
      },
      async startFreeformWork() {
        throw new Error("unexpected freeform call");
      },
      async startGuidedAcpPlanning() {
        throw new Error("unexpected guided ACP call");
      },
      async restartPlanningCycleFromUpdates() {
        throw new Error("unexpected continuous update call");
      },
    };
    const controller = new PlanningPreviewController(service);

    await expect(controller.previewApprovedPlan(input)).resolves.toBe(preview);
    expect(service.seen).toBe(input);
  });

  test("delegates approved-plan materialization to the server-owned planning service", async () => {
    const input = Object.assign(new PlanningMaterializeRequestDto(), {
      ...validApprovedPlanInput(),
      workspaceId: "workspace-nest",
      workspaceSlug: "nest",
      workspaceName: "Nest workspace",
      projectSlug: "project-nest",
      projectName: "Project Nest",
    });
    const materialized: ApprovedPlanMaterializeResult = {
      breakdown: {
        title: "Agent-native docs workflow",
        docs: [],
        artifacts: [],
        successCriteria: [],
        taskDrafts: [],
        dependencyUpdates: [],
        warnings: [],
      },
      materialization: {
        docs: [],
        artifacts: [],
        tasks: [],
        dependencyUpdates: [],
      },
    };
    const service = {
      seen: undefined as PlanningMaterializeRequestDto | undefined,
      async materializeApprovedPlan(body: PlanningMaterializeRequestDto) {
        this.seen = body;
        return materialized;
      },
      async previewApprovedPlan() {
        throw new Error("unexpected preview call");
      },
      async buildFreeformDocsPlanningPrompt() {
        throw new Error("unexpected freeform prompt call");
      },
      async generateTechnicalPlanningCycle() {
        throw new Error("unexpected technical planning call");
      },
      async startFreeformWork() {
        throw new Error("unexpected freeform call");
      },
      async startGuidedAcpPlanning() {
        throw new Error("unexpected guided ACP call");
      },
      async restartPlanningCycleFromUpdates() {
        throw new Error("unexpected continuous update call");
      },
    };
    const controller = new PlanningPreviewController(service);

    await expect(controller.materializeApprovedPlan(input)).resolves.toBe(materialized);
    expect(service.seen).toBe(input);
  });

  test("delegates freeform prompt building and technical planning generation to the server-owned planning service", async () => {
    const freeformPromptInput = Object.assign(new PlanningFreeformPromptRequestDto(), {
      projectId: "project-nest",
      userPrompt: "Plan from docs",
      selectedDocIds: ["doc-nest"],
      traceId: "trace-prompt-nest",
    });
    const technicalInput = Object.assign(new PlanningTechnicalCycleRequestDto(), {
      projectId: "project-nest",
      source: "freeform_docs" as const,
      userPrompt: "Generate technical plan",
      selectedDocIds: ["doc-nest"],
      traceId: "trace-technical-nest",
      planId: "plan-technical-nest",
      prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
    });
    const promptOutput: PlanningFreeformPromptResult = {
      context: {
        sourceRefs: [{ kind: "doc", id: "doc-nest" }],
        selectedDocs: [],
        contextMarkdown: "ctx",
        traceId: "trace-prompt-nest",
      },
      prompt: "submit_plan",
    };
    const technicalOutput: PlanningTechnicalCycleResult = {
      status: "ready_for_plan_review",
      eventId: "event-technical-nest",
      context: { sourceRefs: [], selectedDocs: [], contextMarkdown: "" },
      prompt: "prompt",
      reviewPrompt: "review",
      plan: {
        planId: "plan-technical-nest",
        title: "Generate technical plan",
        traceId: "trace-technical-nest",
        source: "freeform_docs",
        markdown: "# Generate technical plan",
        prototypePaths: [],
        boilerplatePaths: [],
        sourceDocRefs: [],
      },
      breakdown: {
        title: "Generate technical plan",
        docs: [],
        artifacts: [],
        successCriteria: [],
        taskDrafts: [],
        dependencyUpdates: [],
        warnings: [],
      },
    };
    const service = {
      seenPrompt: undefined as PlanningFreeformPromptRequestDto | undefined,
      seenTechnical: undefined as PlanningTechnicalCycleRequestDto | undefined,
      async previewApprovedPlan() {
        throw new Error("unexpected preview call");
      },
      async materializeApprovedPlan() {
        throw new Error("unexpected materialize call");
      },
      async buildFreeformDocsPlanningPrompt(
        body: PlanningFreeformPromptRequestDto,
      ): Promise<PlanningFreeformPromptResult> {
        this.seenPrompt = body;
        return promptOutput;
      },
      async generateTechnicalPlanningCycle(
        body: PlanningTechnicalCycleRequestDto,
      ): Promise<PlanningTechnicalCycleResult> {
        this.seenTechnical = body;
        return technicalOutput;
      },
      async startFreeformWork() {
        throw new Error("unexpected freeform call");
      },
      async startGuidedAcpPlanning() {
        throw new Error("unexpected guided ACP call");
      },
      async restartPlanningCycleFromUpdates() {
        throw new Error("unexpected continuous update call");
      },
    };
    const controller = new PlanningPreviewController(service);

    await expect(controller.buildFreeformDocsPlanningPrompt(freeformPromptInput)).resolves.toBe(promptOutput);
    await expect(controller.generateTechnicalPlanningCycle(technicalInput)).resolves.toBe(technicalOutput);
    expect(service.seenPrompt).toBe(freeformPromptInput);
    expect(service.seenTechnical).toBe(technicalInput);
  });

  test("delegates freeform and guided ACP starts to the server-owned planning service", async () => {
    const freeformInput = Object.assign(new PlanningFreeformStartRequestDto(), {
      workspaceId: "workspace-nest",
      workspaceSlug: "nest",
      workspaceName: "Nest workspace",
      projectId: "project-nest",
      projectSlug: "project-nest",
      projectName: "Project Nest",
      parentId: "parent-doc-nest",
      title: "Freeform work brief",
      bodyMd: "Start from docs and then plan through ACP.",
      userPrompt: "Plan this work",
      traceId: "trace-freeform-nest",
    });
    const guidedInput = Object.assign(new PlanningGuidedAcpStartRequestDto(), {
      workspaceId: "workspace-nest",
      workspaceSlug: "nest",
      workspaceName: "Nest workspace",
      projectId: "project-nest",
      projectSlug: "project-nest",
      projectName: "Project Nest",
      acpSessionId: "acp-nest",
      agentName: "codex",
      cwd: "/workspace",
      userPrompt: "Plan guided ACP",
      selectedDocIds: ["doc-nest"],
      traceId: "trace-guided-nest",
    });
    const continuousInput = Object.assign(new PlanningContinuousUpdateRequestDto(), {
      workspaceId: "workspace-nest",
      workspaceSlug: "nest",
      workspaceName: "Nest workspace",
      projectId: "project-nest",
      projectSlug: "project-nest",
      projectName: "Project Nest",
      trigger: "manual_doc_edit" as const,
      userPrompt: "Replan from updated docs",
      changedDocs: [{ id: "doc-nest", bodyMd: "Updated context" }],
      selectedDocIds: ["doc-nest"],
      targetTaskIds: ["task-nest"],
      traceId: "trace-continuous-nest",
      acpSessionId: "acp-nest",
    });
    const service = {
      seenFreeform: undefined as PlanningFreeformStartRequestDto | undefined,
      seenGuided: undefined as PlanningGuidedAcpStartRequestDto | undefined,
      seenContinuous: undefined as PlanningContinuousUpdateRequestDto | undefined,
      async previewApprovedPlan() {
        throw new Error("unexpected preview call");
      },
      async materializeApprovedPlan() {
        throw new Error("unexpected materialize call");
      },
      async buildFreeformDocsPlanningPrompt() {
        throw new Error("unexpected freeform prompt call");
      },
      async generateTechnicalPlanningCycle() {
        throw new Error("unexpected technical planning call");
      },
      async startFreeformWork(
        body: PlanningFreeformStartRequestDto,
      ): Promise<PlanningFreeformStartResult> {
        this.seenFreeform = body;
        return {
          status: "ready_for_planning",
          document: {
            id: "doc-nest",
            projectId: "project-nest",
            parentId: "parent-doc-nest",
            title: "Freeform brief",
            bodyMd: "Start from docs and then plan through ACP.",
            sourceType: "freeform_work_intake",
            traceId: "trace-freeform-nest",
          },
          context: { sourceRefs: [{ kind: "doc" as const, id: "doc-nest" }], selectedDocs: [], contextMarkdown: "" },
          prompt: "submit_plan",
        };
      },
      async startGuidedAcpPlanning(
        body: PlanningGuidedAcpStartRequestDto,
      ): Promise<PlanningGuidedAcpStartResult> {
        this.seenGuided = body;
        return {
          status: "ready_for_acp_prompt",
          session: {
            acpSessionId: "acp-nest",
            agentName: "codex",
            cwd: "/workspace",
            promptTemplateId: "default",
            projectId: "project-nest",
            traceId: "trace-guided-nest",
            modeId: "plan",
            permissionMode: "review_each_tool" as const,
          },
          traffic: { entries: [] },
          context: { sourceRefs: [{ kind: "doc" as const, id: "doc-nest" }], selectedDocs: [], contextMarkdown: "" },
          prompt: "submit_plan",
        };
      },
      async restartPlanningCycleFromUpdates(
        body: PlanningContinuousUpdateRequestDto,
      ): Promise<PlanningContinuousUpdateResult> {
        this.seenContinuous = body;
        return {
          status: "ready_for_replanning",
          trigger: "manual_doc_edit",
          traceId: "trace-continuous-nest",
          acpSessionId: "acp-nest",
          targetTaskIds: ["task-nest"],
          targetTasks: [],
          missingTargetTaskIds: [],
          changedDocs: [
            {
              id: "doc-nest",
              projectId: "project-nest",
              parentId: null,
              title: "Freeform brief",
              bodyMd: "Updated context",
              sourceType: "continuous_update_replan",
              traceId: "trace-continuous-nest",
            },
          ],
          traffic: { entries: [] },
          context: { sourceRefs: [{ kind: "doc" as const, id: "doc-nest" }], selectedDocs: [], contextMarkdown: "" },
          prompt: "submit_plan",
        };
      },
    };
    const controller = new PlanningPreviewController(service);

    await expect(controller.startFreeformWork(freeformInput)).resolves.toMatchObject({
      status: "ready_for_planning",
      document: { id: "doc-nest" },
    });
    await expect(controller.startGuidedAcpPlanning(guidedInput)).resolves.toMatchObject({
      status: "ready_for_acp_prompt",
      session: { acpSessionId: "acp-nest" },
    });
    await expect(controller.restartPlanningCycleFromUpdates(continuousInput)).resolves.toMatchObject({
      status: "ready_for_replanning",
      changedDocs: [{ id: "doc-nest" }],
    });
    expect(service.seenFreeform).toBe(freeformInput);
    expect(service.seenFreeform?.parentId).toBe("parent-doc-nest");
    expect(service.seenGuided).toBe(guidedInput);
    expect(service.seenContinuous).toBe(continuousInput);
  });

  test("keeps approved-plan request validation at the Nest boundary", () => {
    const valid = validApprovedPlanInput();
    const invalid = Object.assign(new PlanningApprovedPlanRequestDto(), {
      planId: "",
      approvedPlanMarkdown: "",
    });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual([
      "approvedPlanMarkdown",
      "planId",
    ]);

    const materializeInvalid = Object.assign(new PlanningMaterializeRequestDto(), {
      planId: "",
      approvedPlanMarkdown: "",
      projectId: "",
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectSlug: "",
      projectName: "",
    });
    expect(validateSync(materializeInvalid).map((error) => error.property).sort()).toEqual([
      "approvedPlanMarkdown",
      "planId",
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const freeformPromptInvalid = Object.assign(new PlanningFreeformPromptRequestDto(), {
      projectId: "",
      userPrompt: "",
    });
    expect(validateSync(freeformPromptInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "userPrompt",
    ]);

    const technicalInvalid = Object.assign(new PlanningTechnicalCycleRequestDto(), {
      projectId: "",
      source: "",
      userPrompt: "",
    });
    expect(validateSync(technicalInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "source",
      "userPrompt",
    ]);

    const freeformInvalid = Object.assign(new PlanningFreeformStartRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      title: "",
      bodyMd: "",
      userPrompt: "",
    });
    expect(validateSync(freeformInvalid).map((error) => error.property).sort()).toEqual([
      "bodyMd",
      "projectId",
      "projectName",
      "projectSlug",
      "title",
      "userPrompt",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const continuousInvalid = Object.assign(new PlanningContinuousUpdateRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      trigger: "",
      userPrompt: "",
    });
    expect(validateSync(continuousInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "trigger",
      "userPrompt",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);
  });

  test("service builds the same copied planning preview model", async () => {
    const service = new PlanningPreviewService();

    const result = await service.previewApprovedPlan(validApprovedPlanInput());

    expect(result.title).toBe("Agent-native docs workflow");
    expect(result.docs.map((doc) => doc.clientKey)).toContain("plan-doc");
    expect(result.taskDrafts.map((task) => task.clientKey)).toEqual(["docs", "acp", "verify-end-to-end"]);
    expect(result.dependencyUpdates).toEqual([
      { taskClientKey: "acp", blockedByClientKeys: ["docs"] },
      { taskClientKey: "verify-end-to-end", blockedByClientKeys: ["acp"] },
    ]);
    expect(result.artifacts).toContainEqual({
      kind: "prototype",
      path: "apps/web/src/routes/planning/+page.svelte",
      sourcePlanId: "plan-nest-preview",
      title: "+page.svelte",
      traceId: "trace-nest",
    });
  });
});
