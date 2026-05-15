import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FulcrumArtifactEntity,
  FulcrumPlanEntity,
  FulcrumPlanPrototypeEntity,
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FulcrumDocumentEntity,
  FulcrumAcpSessionEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { PlanningPreviewService } from "@workflow-coordination/application/planning-preview.service.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
});

describe("Planning preview Nest materialization service", () => {
  test("rejects approved-plan materialization without a real project id", async () => {
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "postgres",
        url: "postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum",
        entities: [],
        migrations: [],
      }),
    );
    const service = new PlanningPreviewService(dataSource);

    await expect(service.materializeApprovedPlan({
      planId: "plan-missing-project",
      approvedPlanMarkdown: "# Missing project",
      projectId: "",
      workspaceId: "workspace-missing-project",
      workspaceSlug: "missing-project",
      workspaceName: "Missing project workspace",
      projectSlug: "missing-project",
      projectName: "Missing project",
    })).rejects.toThrow("projectId is required.");
  });

  test("materializes an approved approved plan into TypeORM docs, tasks, dependencies, artifacts, and plan rows", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const service = new PlanningPreviewService(dataSource);

      const result = await service.materializeApprovedPlan({
        planId: "plan-nest-materialize",
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
        projectId: "project-nest-materialize",
        traceId: "trace-nest-materialize",
        reviewId: "review-nest-materialize",
        workspaceId: "workspace-nest-materialize",
        workspaceSlug: "nest-materialize",
        workspaceName: "Nest materialize workspace",
        projectSlug: "project-nest-materialize",
        projectName: "Nest Materialize Project",
        sourceDocRefs: [{ kind: "doc", id: "doc-source" }],
      });

      expect(result.breakdown.taskDrafts.map((task) => task.clientKey)).toEqual([
        "docs",
        "acp",
        "verify-end-to-end",
      ]);
      expect(result.materialization.docs.map((doc) => doc.clientKey)).toContain("plan-doc");
      expect(result.materialization.tasks).toEqual([
        { clientKey: "docs", id: "task-plan-nest-materialize-docs" },
        { clientKey: "acp", id: "task-plan-nest-materialize-acp" },
        { clientKey: "verify-end-to-end", id: "task-plan-nest-materialize-verify-end-to-end" },
      ]);
      expect(result.materialization.dependencyUpdates).toEqual([
        {
          taskClientKey: "acp",
          taskId: "task-plan-nest-materialize-acp",
          blockedByClientKeys: ["docs"],
          blockedByTaskIds: ["task-plan-nest-materialize-docs"],
        },
        {
          taskClientKey: "verify-end-to-end",
          taskId: "task-plan-nest-materialize-verify-end-to-end",
          blockedByClientKeys: ["acp"],
          blockedByTaskIds: ["task-plan-nest-materialize-acp"],
        },
      ]);

      await expect(dataSource.getRepository(FulcrumWorkspaceEntity).findOneByOrFail({
        id: "workspace-nest-materialize",
      })).resolves.toMatchObject({ slug: "nest-materialize" });
      await expect(dataSource.getRepository(FulcrumProjectEntity).findOneByOrFail({
        id: "project-nest-materialize",
      })).resolves.toMatchObject({
        workspaceId: "workspace-nest-materialize",
        traceId: "trace-nest-materialize",
      });
      await expect(dataSource.getRepository(FulcrumPlanEntity).findOneByOrFail({
        id: "plan-nest-materialize",
      })).resolves.toMatchObject({
        projectId: "project-nest-materialize",
        traceId: "trace-nest-materialize",
        status: "approved",
      });

      const docs = await dataSource.getRepository(FulcrumDocumentEntity).find({
        where: { traceId: "trace-nest-materialize" },
      });
      expect(docs.map((doc) => doc.sourceType).sort()).toEqual([
        "approved_plan",
        "prototype_artifact",
        "success_criteria",
      ]);
      expect(docs.find((doc) => doc.sourceType === "approved_plan")?.bodyMd).toContain(
        "Freeform docs feed ACP planning.",);

      const tasks = await dataSource.getRepository(FulcrumTaskEntity).find({
        where: { projectId: "project-nest-materialize" },
      });
      expect(tasks.map((task) => [task.id, task.status, task.successCriteria.length])).toEqual([
        ["task-plan-nest-materialize-docs", "todo", 0],
        ["task-plan-nest-materialize-acp", "todo", 0],
        ["task-plan-nest-materialize-verify-end-to-end", "todo", 1],
      ]);

      const dependencies = await dataSource.getRepository(FulcrumTaskDependencyEntity).find({
        where: { traceId: "trace-nest-materialize" },
      });
      expect(dependencies.map((dependency) => ({
        taskId: dependency.taskId,
        dependsOnTaskId: dependency.dependsOnTaskId,
        dependencyKind: dependency.dependencyKind,
      }))).toEqual([
        {
          taskId: "task-plan-nest-materialize-acp",
          dependsOnTaskId: "task-plan-nest-materialize-docs",
          dependencyKind: "approved_plan_dependency",
        },
        {
          taskId: "task-plan-nest-materialize-verify-end-to-end",
          dependsOnTaskId: "task-plan-nest-materialize-acp",
          dependencyKind: "approved_plan_dependency",
        },
      ]);

      await expect(dataSource.getRepository(FulcrumArtifactEntity).findOneByOrFail({
        id: "artifact-plan-nest-materialize-1",
      })).resolves.toMatchObject({
        kind: "prototype",
        bodyPath: "apps/web/src/routes/planning/+page.svelte",
      });
      const approvedPrototype = await dataSource.getRepository(FulcrumPlanPrototypeEntity).findOneByOrFail({
        id: "prototype-plan-nest-materialize-1",
      });
      expect(approvedPrototype).toMatchObject({
        planId: "plan-nest-materialize",
        artifactId: "artifact-plan-nest-materialize-1",
        status: "planned",
      });
      expect(approvedPrototype.metadata.preview).toMatchObject({
        kind: "prototype",
        path: "apps/web/src/routes/planning/+page.svelte",
        mode: "web-route",
        urlPath: "/planning",
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("starts freeform work and guided ACP planning with TypeORM documents and session traffic", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const service = new PlanningPreviewService(dataSource);

      const freeform = await service.startFreeformWork({
        workspaceId: "workspace-freeform-nest",
        workspaceSlug: "freeform-nest",
        workspaceName: "Freeform Nest",
        projectId: "project-freeform-nest",
        projectSlug: "freeform-nest",
        projectName: "Freeform Nest Project",
        documentId: "doc-freeform-nest",
        parentId: "parent-freeform-nest",
        title: "Freeform work brief",
        bodyMd: "Preserve document workspace, ACP planning, work items, and dependency runs.",
        userPrompt: "Plan this workflow from the freeform brief.",
        traceId: "trace-freeform-nest",
        acpSessionId: "acp-freeform-nest",
        modeId: "planning",
        modelId: "gpt-5.4",
      });

      expect(freeform).toMatchObject({
        status: "ready_for_planning",
        document: {
          id: "doc-freeform-nest",
          parentId: "parent-freeform-nest",
          title: "Freeform work brief",
          sourceType: "freeform_work_intake",
          traceId: "trace-freeform-nest",
        },
      });
      expect(freeform.prompt).toContain("Plan this workflow from the freeform brief.");
      expect(freeform.prompt).toContain("Preserve document workspace, ACP planning, work items, and dependency runs.");
      expect(freeform.context.sourceRefs).toEqual([
        {
          kind: "doc",
          id: "doc-freeform-nest",
        },
      ]);
      expect(freeform.context.traceId).toBe("trace-freeform-nest");

      const guided = await service.startGuidedAcpPlanning({
        workspaceId: "workspace-freeform-nest",
        workspaceSlug: "freeform-nest",
        workspaceName: "Freeform Nest",
        projectId: "project-freeform-nest",
        projectSlug: "freeform-nest",
        projectName: "Freeform Nest Project",
        acpSessionId: "acp-guided-nest",
        agentName: "codex",
        cwd: "/Users/mkh/workspace/fulcrum",
        userPrompt: "Use the freeform brief to create the technical plan.",
        selectedDocIds: ["doc-freeform-nest"],
        traceId: "trace-freeform-nest",
        modeId: "planning",
        modelId: "gpt-5.4",
        permissionMode: "review_each_tool",
      });

      expect(guided).toMatchObject({
        status: "ready_for_acp_prompt",
        session: {
          acpSessionId: "acp-guided-nest",
          agentName: "codex",
          modeId: "planning",
          modelId: "gpt-5.4",
          permissionMode: "review_each_tool",
        },
      });
      expect(guided.prompt).toContain("## ACP guided session");
      expect(guided.prompt).toContain("Use the freeform brief to create the technical plan.");
      expect(guided.traffic.entries.map((entry) => entry.method)).toEqual([
        "session/new",
        "session/prompt",
      ]);

      await expect(dataSource.getRepository(FulcrumDocumentEntity).findOneByOrFail({
        id: "doc-freeform-nest",
      })).resolves.toMatchObject({
        projectId: "project-freeform-nest",
        parentId: "parent-freeform-nest",
        sourceType: "freeform_work_intake",
        traceId: "trace-freeform-nest",
      });
      await expect(dataSource.getRepository(FulcrumAcpSessionEntity).findOneByOrFail({
        id: "acp-guided-nest",
      })).resolves.toMatchObject({
        projectId: "project-freeform-nest",
        traceId: "trace-freeform-nest",
        agentName: "codex",
        mode: "planning",
        model: "gpt-5.4",
        status: "ready_for_acp_prompt",
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("builds freeform planning prompts and persists generated technical planning drafts", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const service = new PlanningPreviewService(dataSource);
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-build-plan",
        slug: "build-plan",
        name: "Build Plan Workspace",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-build-plan",
        workspaceId: "workspace-build-plan",
        slug: "build-plan",
        name: "Build Plan Project",
        traceId: "trace-build-plan",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-build-plan",
        projectId: "project-build-plan",
        title: "Workflow context",
        bodyMd: "Prototype the planning workbench, then create traceable task execution.",
        sourceType: "freeform_work_intake",
        traceId: "trace-build-plan",
      });

      const prompt = await service.buildFreeformDocsPlanningPrompt({
        projectId: "project-build-plan",
        userPrompt: "Plan from persisted docs.",
        selectedDocIds: ["doc-build-plan"],
        traceId: "trace-build-plan",
      });
      expect(prompt.context.sourceRefs).toEqual([{ kind: "doc", id: "doc-build-plan" }]);
      expect(prompt.prompt).toContain("Plan from persisted docs.");
      expect(prompt.prompt).toContain("Prototype the planning workbench");

      const generated = await service.generateTechnicalPlanningCycle({
        projectId: "project-build-plan",
        source: "freeform_docs",
        userPrompt: "Plan from persisted docs.",
        selectedDocIds: ["doc-build-plan"],
        traceId: "trace-build-plan",
        planId: "plan-build-plan",
        prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
        boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
        successCriteria: ["Generated plan is reviewable."],
        taskSeeds: [{ clientKey: "T1", title: "Assemble context" }],
      });

      expect(generated.status).toBe("ready_for_plan_review");
      expect(generated.eventId).toBe("event-plan-build-plan-technical-planning-generated");
      expect(generated.plan.markdown).toContain("Prototype the planning workbench");
      expect(generated.breakdown.taskDrafts.map((task) => task.clientKey)).toEqual([
        "T1",
        "verify-end-to-end",
      ]);
      expect(generated.artifactPreviews.map((preview) => ({
        path: preview.path,
        mode: preview.mode,
        urlPath: preview.urlPath,
      }))).toEqual([
        {
          path: "apps/web/src/routes/planning/workbench-prototype.tsx",
          mode: "web-route",
          urlPath: "/planning",
        },
        {
          path: "services/planning-review/src/application/technical-planning-cycle.ts",
          mode: "source-module",
          urlPath: undefined,
        },
      ]);

      await expect(dataSource.getRepository(FulcrumPlanEntity).findOneByOrFail({
        id: "plan-build-plan",
      })).resolves.toMatchObject({
        projectId: "project-build-plan",
        status: "draft",
        traceId: "trace-build-plan",
      });

      const artifacts = await dataSource.getRepository(FulcrumArtifactEntity).find({
        where: { projectId: "project-build-plan" },
      });
      expect(artifacts.map((artifact) => ({
        kind: artifact.kind,
        bodyPath: artifact.bodyPath,
      })).sort((left, right) => String(left.bodyPath).localeCompare(String(right.bodyPath)))).toEqual([
        {
          kind: "prototype",
          bodyPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
        },
        {
          kind: "boilerplate",
          bodyPath: "services/planning-review/src/application/technical-planning-cycle.ts",
        },
      ].sort((left, right) => String(left.bodyPath).localeCompare(String(right.bodyPath))));

      const prototypes = await dataSource.getRepository(FulcrumPlanPrototypeEntity).find({
        where: { planId: "plan-build-plan" },
      });
      const sortedPrototypes = prototypes.sort((left, right) => String(left.outputRef).localeCompare(String(right.outputRef)));
      expect(sortedPrototypes.map((prototype) => ({
        kind: prototype.kind,
        status: prototype.status,
        outputRef: prototype.outputRef,
      }))).toEqual([
        {
          kind: "prototype",
          status: "draft",
          outputRef: "apps/web/src/routes/planning/workbench-prototype.tsx",
        },
        {
          kind: "boilerplate",
          status: "draft",
          outputRef: "services/planning-review/src/application/technical-planning-cycle.ts",
        },
      ]);
      const prototypeRow = sortedPrototypes.find((prototype) =>
        prototype.outputRef === "apps/web/src/routes/planning/workbench-prototype.tsx"
      );
      if (!prototypeRow) throw new Error("Expected generated prototype row.");
      expect(prototypeRow.metadata.preview).toMatchObject({
        path: "apps/web/src/routes/planning/workbench-prototype.tsx",
        mode: "web-route",
        urlPath: "/planning",
      });

      const execution = await service.recordArtifactExecution({
        planId: "plan-build-plan",
        artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
        prototypeId: prototypeRow.id,
        artifactId: prototypeRow.artifactId ?? undefined,
        status: "passed",
        traceId: "trace-build-plan",
        command: "bun",
        args: ["run", "--cwd", "apps/web", "test"],
        urlPath: "/planning",
        summary: "Planning route preview was reviewed with trace context visible.",
        checks: ["trace context visible", "review checks visible"],
        executedAt: "2026-05-15T12:00:00.000Z",
      });

      expect(execution).toMatchObject({
        prototypeId: prototypeRow.id,
        artifactId: prototypeRow.artifactId,
        status: "passed",
        prototypeStatus: "validated",
      });
      const persistedPrototype = await dataSource.getRepository(FulcrumPlanPrototypeEntity).findOneByOrFail({
        id: prototypeRow.id,
      });
      expect(persistedPrototype.status).toBe("validated");
      expect(persistedPrototype.metadata.preview).toMatchObject({
        path: "apps/web/src/routes/planning/workbench-prototype.tsx",
        mode: "web-route",
      });
      expect(persistedPrototype.metadata.execution).toMatchObject({
        status: "passed",
        prototypeId: prototypeRow.id,
        artifactId: prototypeRow.artifactId,
        summary: "Planning route preview was reviewed with trace context visible.",
      });
      expect(persistedPrototype.metadata.executions).toHaveLength(1);
    } finally {
      await dataSource.destroy();
    }
  });

  test("restarts planning from continuous doc updates with TypeORM docs, ACP traffic, and task context", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const service = new PlanningPreviewService(dataSource);
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-continuous-nest",
        slug: "continuous-nest",
        name: "Continuous Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-continuous-nest",
        workspaceId: "workspace-continuous-nest",
        slug: "continuous-nest",
        name: "Continuous Nest Project",
        traceId: "trace-continuous-nest",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-existing-continuous",
        projectId: "project-continuous-nest",
        title: "Original context",
        bodyMd: "Old ACP planning context.",
        sourceType: "freeform_work_intake",
        traceId: "trace-continuous-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save([
        {
          id: "task-foundation-continuous",
          projectId: "project-continuous-nest",
          title: "Foundation task",
          status: "done",
          successCriteria: ["Foundation criteria"],
          traceId: "trace-continuous-nest",
        },
        {
          id: "task-target-continuous",
          projectId: "project-continuous-nest",
          title: "Target task",
          status: "todo",
          successCriteria: ["Updated docs feed replanning"],
          traceId: "trace-continuous-nest",
        },
      ]);
      await dataSource.getRepository(FulcrumTaskDependencyEntity).save({
        id: "dependency-continuous",
        projectId: "project-continuous-nest",
        taskId: "task-target-continuous",
        dependsOnTaskId: "task-foundation-continuous",
        dependencyKind: "approved_plan_dependency",
        traceId: "trace-continuous-nest",
      });
      await dataSource.getRepository(FulcrumAcpSessionEntity).save({
        id: "acp-continuous-nest",
        projectId: "project-continuous-nest",
        traceId: "trace-continuous-nest",
        agentName: "codex",
        mode: "planning",
        model: "gpt-5.4",
        status: "ready_for_acp_prompt",
        trafficLog: [{ direction: "out", type: "request", method: "session/new", requestId: 1 }],
      });

      const result = await service.restartPlanningCycleFromUpdates({
        workspaceId: "workspace-continuous-nest",
        workspaceSlug: "continuous-nest",
        workspaceName: "Continuous Nest",
        projectId: "project-continuous-nest",
        projectSlug: "continuous-nest",
        projectName: "Continuous Nest Project",
        trigger: "manual_doc_edit",
        userPrompt: "Replan after the updated document page.",
        changedDocs: [
          {
            id: "doc-existing-continuous",
            bodyMd: "Updated ACP planning context with new dependency needs.",
          },
          {
            title: "New acceptance note",
            bodyMd: "Add regression coverage after UAT approval.",
          },
        ],
        selectedDocIds: ["doc-existing-continuous"],
        targetTaskIds: ["task-target-continuous", "task-missing-continuous"],
        traceId: "trace-continuous-nest",
        acpSessionId: "acp-continuous-nest",
        modeId: "planning",
        modelId: "gpt-5.4",
      });

      expect(result).toMatchObject({
        status: "ready_for_replanning",
        trigger: "manual_doc_edit",
        traceId: "trace-continuous-nest",
        acpSessionId: "acp-continuous-nest",
        targetTaskIds: ["task-target-continuous", "task-missing-continuous"],
        missingTargetTaskIds: ["task-missing-continuous"],
      });
      expect(result.changedDocs.map((doc) => [doc.id, doc.sourceType])).toEqual([
        ["doc-existing-continuous", "continuous_update_replan"],
        ["doc-trace-continuous-nest-new-acceptance-note", "continuous_update_replan"],
      ]);
      expect(result.context.sourceRefs).toEqual([
        { kind: "doc", id: "doc-existing-continuous" },
        { kind: "doc", id: "doc-trace-continuous-nest-new-acceptance-note" },
      ]);
      expect(result.prompt).toContain("## Continuous update / replanning cycle");
      expect(result.prompt).toContain("Replan after the updated document page.");
      expect(result.prompt).toContain("Target task (task-target-continuous)");
      expect(result.prompt).toContain("Blocked by: Foundation task");
      expect(result.prompt).toContain("Missing target task IDs: task-missing-continuous");
      expect(result.traffic.entries.map((entry) => entry.method)).toEqual([
        "session/new",
        "session/update",
        "session/prompt",
      ]);

      await expect(dataSource.getRepository(FulcrumDocumentEntity).findOneByOrFail({
        id: "doc-existing-continuous",
      })).resolves.toMatchObject({
        bodyMd: "Updated ACP planning context with new dependency needs.",
        sourceType: "continuous_update_replan",
      });
      await expect(dataSource.getRepository(FulcrumAcpSessionEntity).findOneByOrFail({
        id: "acp-continuous-nest",
      })).resolves.toMatchObject({
        status: "ready_for_replanning",
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
