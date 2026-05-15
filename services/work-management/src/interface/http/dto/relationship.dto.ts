import type { RelationshipType } from "@work-management/infrastructure/database/relationship-store.ts";
import type { TraceRef } from "@workflow-coordination/domain/trace.ts";

export class RelationshipTaskScopeDto {
  orgId!: string;
  taskId!: string;
}

export class RelationshipProjectScopeDto {
  orgId!: string;
  projectId!: string;
}

export class RelationshipCreateDto {
  orgId!: string;
  sourceTaskId!: string;
  targetTaskId!: string;
  type!: RelationshipType;
}

export class RelationshipDeleteDto {
  orgId!: string;
  relationshipId!: string;
}

export class RelationshipDuplicateDto {
  orgId!: string;
  sourceTaskId!: string;
  targetTaskId!: string;
  autoClose?: boolean;
  transferWatchers?: boolean;
}

export class RelationshipSummaryDto {
  orgId!: string;
  projectId!: string;
  entity!: TraceRef;
}
