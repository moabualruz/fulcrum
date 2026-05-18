import type {
  WorkflowMethodology,
  WorkflowTransitionGraph,
} from "@work-management/domain/workflow-settings.ts";

export class WorkflowDefaultRequestDto {
  methodology!: WorkflowMethodology;
}

export class WorkflowProjectScopeDto {
  orgId!: string;
  projectId!: string;
}

export class WorkflowTaskTypesUpdateDto extends WorkflowProjectScopeDto {
  types!: string[];
}

export class WorkflowMethodologyUpdateDto extends WorkflowProjectScopeDto {
  methodology!: WorkflowMethodology;
  resetWorkflow?: boolean;
}

export class WorkflowTransitionsUpdateDto extends WorkflowProjectScopeDto {
  transitions!: WorkflowTransitionGraph;
}

export class WorkflowTransitionValidationDto extends WorkflowProjectScopeDto {
  fromStatus!: string;
  toStatus!: string;
}
