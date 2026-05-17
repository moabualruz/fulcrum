import "reflect-metadata";

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FULCRUM_JOB_QUEUE_ENTITIES,
} from "@platform-core/infrastructure/database/job-queue.entities.ts";
import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkContextController } from "@workflow-coordination/interface/http/work-context.controller.ts";
import { WorkContextPersistenceService } from "@workflow-coordination/application/work-context-persistence.service.ts";
import { DocumentWorkspaceController } from "@workflow-coordination/interface/http/document-workspace.controller.ts";
import { DocumentWorkspaceService } from "@workflow-coordination/application/document-workspace.service.ts";
import { DependencyExecutionController } from "@workflow-coordination/interface/http/dependency-execution.controller.ts";
import { DependencyRunService } from "@workflow-coordination/application/dependency-execution.service.ts";
import { PlanningPreviewController } from "@workflow-coordination/interface/http/planning-preview.controller.ts";
import { PlanningPreviewService } from "@workflow-coordination/application/planning-preview.service.ts";
import { ReviewWorkbenchController } from "@workflow-coordination/interface/http/review-workbench.controller.ts";
import { ReviewWorkbenchService } from "@workflow-coordination/application/review-workbench.service.ts";
import { WorkflowAcceptanceCycleService } from "@workflow-coordination/application/workflow-acceptance-cycle.ts";
import { WorkflowCycleController } from "@workflow-coordination/interface/http/workflow-cycle.controller.ts";
import { WorkflowCyclePersistenceService } from "@workflow-coordination/application/workflow-cycle-persistence.service.ts";

export class WorkflowCycleModule {}

Module({
  imports: [
    TypeOrmModule.forFeature([
      ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
      ...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
      ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
      ...FULCRUM_JOB_QUEUE_ENTITIES,
    ]),
  ],
  controllers: [
    WorkflowCycleController,
    WorkContextController,
    DocumentWorkspaceController,
    DependencyExecutionController,
    PlanningPreviewController,
    ReviewWorkbenchController,
  ],
  providers: [
    WorkflowCyclePersistenceService,
    WorkContextPersistenceService,
    DocumentWorkspaceService,
    DependencyRunService,
    PlanningPreviewService,
    ReviewWorkbenchService,
    WorkflowAcceptanceCycleService,
  ],
  exports: [
    WorkflowCyclePersistenceService,
    WorkContextPersistenceService,
    DocumentWorkspaceService,
    DependencyRunService,
    PlanningPreviewService,
    ReviewWorkbenchService,
    WorkflowAcceptanceCycleService,
  ],
})(WorkflowCycleModule);
