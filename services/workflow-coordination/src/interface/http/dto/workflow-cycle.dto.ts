import type {
  WorkflowAcceptanceCycleInput,
} from "@workflow-coordination/application/workflow-acceptance-cycle.ts";
import type {
  WorkflowCycleCycleInput,
  WorkflowCycleTraceSummary,
} from "@workflow-coordination/application/workflow-cycle-persistence.service.ts";

export class WorkflowAcceptanceCycleRequestDto implements WorkflowAcceptanceCycleInput {
  workspace!: WorkflowAcceptanceCycleInput["workspace"];
  project!: WorkflowAcceptanceCycleInput["project"];
  freeform!: WorkflowAcceptanceCycleInput["freeform"];
  guidedPlanning!: WorkflowAcceptanceCycleInput["guidedPlanning"];
  approvedPlan!: WorkflowAcceptanceCycleInput["approvedPlan"];
  execution!: WorkflowAcceptanceCycleInput["execution"];
  uat!: WorkflowAcceptanceCycleInput["uat"];
}

export class WorkflowCycleCycleRequestDto implements WorkflowCycleCycleInput {
  workspace!: WorkflowCycleCycleInput["workspace"];
  project!: WorkflowCycleCycleInput["project"];
  freeformDoc!: WorkflowCycleCycleInput["freeformDoc"];
  planningTask!: WorkflowCycleCycleInput["planningTask"];
  executionTask!: WorkflowCycleCycleInput["executionTask"];
  plan!: WorkflowCycleCycleInput["plan"];
  prototype!: WorkflowCycleCycleInput["prototype"];
  review!: WorkflowCycleCycleInput["review"];
  uat!: WorkflowCycleCycleInput["uat"];
  generatedE2E!: WorkflowCycleCycleInput["generatedE2E"];
}

export class WorkflowCycleTraceParamsDto {
  traceId!: string;
}

export class WorkflowCyclePersistedResponseDto {
  status!: "persisted";
  traceId!: string;
}

export class WorkflowCycleTraceSummaryDto implements WorkflowCycleTraceSummary {
  traceId!: string;
  workspaceId!: string;
  projectId!: string;
  documentIds!: string[];
  taskIds!: string[];
  dependencyEdges!: Array<{ taskId: string; dependsOnTaskId: string }>;
  planIds!: string[];
  prototypeIds!: string[];
  reviewSessionIds!: string[];
  uatSessionIds!: string[];
  generatedE2ETestIds!: string[];
  artifactIds!: string[];
  agentRunIds!: string[];
}
