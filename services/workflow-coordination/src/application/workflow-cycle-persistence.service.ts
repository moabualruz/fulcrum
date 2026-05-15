import "reflect-metadata";

import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import {
  FulcrumArtifactEntity,
  FulcrumGeneratedE2ETestEntity,
  FulcrumPlanEntity,
  FulcrumPlanPrototypeEntity,
  FulcrumReviewAnnotationEntity,
  FulcrumReviewSessionEntity,
  FulcrumUatSessionEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FulcrumAcpSessionEntity,
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface WorkflowCycleCycleInput {
  workspace: { id: string; slug: string; name: string };
  project: { id: string; slug: string; name: string; traceId: string };
  freeformDoc: { id: string; title: string; bodyMd: string };
  planningTask: {
    id: string;
    title: string;
    status: string;
    successCriteria: string[];
  };
  executionTask: {
    id: string;
    title: string;
    status: string;
    successCriteria: string[];
    dependsOnTaskId: string;
  };
  plan: { id: string; title: string; planMd: string; status: string };
  prototype: { id: string; artifactId: string; title: string; outputRef: string };
  review: { id: string; type: string; status: string; annotationId: string };
  uat: { id: string; status: string; finalQaEventId: string | null };
  generatedE2E: {
    id: string;
    runner: string;
    filePath: string;
    bodyMd: string;
  };
}

export interface WorkflowCycleTraceSummary {
  traceId: string;
  workspaceId: string;
  projectId: string;
  documentIds: string[];
  taskIds: string[];
  dependencyEdges: Array<{ taskId: string; dependsOnTaskId: string }>;
  planIds: string[];
  prototypeIds: string[];
  reviewSessionIds: string[];
  uatSessionIds: string[];
  generatedE2ETestIds: string[];
  artifactIds: string[];
  agentRunIds: string[];
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export class WorkflowCyclePersistenceService {
  constructor(private readonly dataSource: DataSource) {}

  async persistCycle(input: WorkflowCycleCycleInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.persistSpine(manager, input);
      await this.persistReviewWorkflow(manager, input);
    });
  }

  async loadTraceSummary(traceId: string): Promise<WorkflowCycleTraceSummary> {
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneByOrFail({
      traceId,
    });

    const [
      docs,
      tasks,
      dependencies,
      plans,
      prototypes,
      reviews,
      uats,
      e2eTests,
      artifacts,
      runs,
    ] = await Promise.all([
      this.dataSource.getRepository(FulcrumDocumentEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumTaskEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumTaskDependencyEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumPlanEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumPlanPrototypeEntity).createQueryBuilder("prototype").innerJoin("fulcrum_plans", "plan", "plan.id = prototype.plan_id").where("plan.trace_id = :traceId", { traceId }).getMany(),
      this.dataSource.getRepository(FulcrumReviewSessionEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumUatSessionEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumGeneratedE2ETestEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumArtifactEntity).find({ where: { traceId } }),
      this.dataSource.getRepository(FulcrumAgentRunEntity).find({ where: { traceId } }),
    ]);

    return {
      traceId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      documentIds: sortStrings(docs.map((doc) => doc.id)),
      taskIds: sortStrings(tasks.map((task) => task.id)),
      dependencyEdges: dependencies.map((dependency) => ({
          taskId: dependency.taskId,
          dependsOnTaskId: dependency.dependsOnTaskId,
        })).sort((a, b) => a.taskId.localeCompare(b.taskId)),
      planIds: sortStrings(plans.map((plan) => plan.id)),
      prototypeIds: sortStrings(prototypes.map((prototype) => prototype.id)),
      reviewSessionIds: sortStrings(reviews.map((review) => review.id)),
      uatSessionIds: sortStrings(uats.map((uat) => uat.id)),
      generatedE2ETestIds: sortStrings(e2eTests.map((test) => test.id)),
      artifactIds: sortStrings(artifacts.map((artifact) => artifact.id)),
      agentRunIds: sortStrings(runs.map((run) => run.id)),
    };
  }

  private async persistSpine(
    manager: EntityManager,
    input: WorkflowCycleCycleInput,): Promise<void> {
    const { traceId } = input.project;
    await manager.getRepository(FulcrumWorkspaceEntity).save(input.workspace);
    await manager.getRepository(FulcrumProjectEntity).save({...input.project,
      workspaceId: input.workspace.id,
    });
    await manager.getRepository(FulcrumDocumentEntity).save({...input.freeformDoc,
      projectId: input.project.id,
      sourceType: "freeform",
      traceId,
    });
    await manager.getRepository(FulcrumTaskEntity).save([
      {...input.planningTask,
        projectId: input.project.id,
        traceId,
      },
      {...input.executionTask,
        projectId: input.project.id,
        traceId,
      },
    ]);
    await manager.getRepository(FulcrumTaskDependencyEntity).save({
      id: `${input.executionTask.id}-depends-on-${input.executionTask.dependsOnTaskId}`,
      projectId: input.project.id,
      taskId: input.executionTask.id,
      dependsOnTaskId: input.executionTask.dependsOnTaskId,
      dependencyKind: "blocks_execution",
      traceId,
    });
    await manager.getRepository(FulcrumAcpSessionEntity).save({
      id: `acp-${input.plan.id}`,
      projectId: input.project.id,
      traceId,
      agentName: "planner",
      mode: "plan",
      model: null,
      status: "closed",
      trafficLog: [{ direction: "outbound", method: "session/new" }],
    });
    await manager.getRepository(FulcrumAgentRunEntity).save({
      id: `run-${input.executionTask.id.replace(/^task-/, "")}`,
      projectId: input.project.id,
      taskId: input.executionTask.id,
      traceId,
      status: "queued",
      dependencyTree: [input.executionTask.dependsOnTaskId, input.executionTask.id],
    });
  }

  private async persistReviewWorkflow(
    manager: EntityManager,
    input: WorkflowCycleCycleInput,): Promise<void> {
    const { traceId } = input.project;
    await manager.getRepository(FulcrumArtifactEntity).save({
      id: input.prototype.artifactId,
      projectId: input.project.id,
      traceId,
      kind: "prototype",
      title: input.prototype.title,
      bodyPath: input.prototype.outputRef,
      checksumSha256: null,
    });
    await manager.getRepository(FulcrumPlanEntity).save({...input.plan,
      projectId: input.project.id,
      traceId,
      sourceDocId: input.freeformDoc.id,
    });
    await manager.getRepository(FulcrumPlanPrototypeEntity).save({...input.prototype,
      planId: input.plan.id,
      kind: "boilerplate",
      status: "approved",
      metadata: { source: "cycle-cycle" },
    });
    await manager.getRepository(FulcrumReviewSessionEntity).save({
      id: input.review.id,
      projectId: input.project.id,
      traceId,
      reviewType: input.review.type,
      subjectId: input.executionTask.id,
      status: input.review.status,
      revision: 1,
      summary: { openFeedback: 0 },
    });
    await manager.getRepository(FulcrumReviewAnnotationEntity).save({
      id: input.review.annotationId,
      reviewSessionId: input.review.id,
      filePath: "src/workflow.ts",
      lineStart: 1,
      lineEnd: 1,
      severity: "info",
      body: "Cycle approved.",
      status: "resolved",
    });
    await manager.getRepository(FulcrumUatSessionEntity).save({
      id: input.uat.id,
      projectId: input.project.id,
      traceId,
      status: input.uat.status,
      finalQaEventId: input.uat.finalQaEventId,
      approvedAt: input.uat.status === "approved" ? new Date("2026-05-13T12:00:00.000Z") : null,
    });
    await manager.getRepository(FulcrumGeneratedE2ETestEntity).save({...input.generatedE2E,
      projectId: input.project.id,
      traceId,
      sourceUatSessionId: input.uat.id,
      status: "materialized",
    });
  }
}

Inject(DataSource)(WorkflowCyclePersistenceService, undefined, 0);
Injectable()(WorkflowCyclePersistenceService);
