import type {
  WorkContextPersistenceSummary,
  WorkContextTraceInput,
} from "@workflow-coordination/application/work-context-persistence.service.ts";

export class WorkContextTraceRequestDto implements WorkContextTraceInput {
  projectId!: string;
  traceId!: string;
  taskId?: string | null;
  runId?: string | null;
  contextBundle!: WorkContextTraceInput["contextBundle"];
  memory!: WorkContextTraceInput["memory"];
  memoryLinks!: WorkContextTraceInput["memoryLinks"];
  runEvents!: WorkContextTraceInput["runEvents"];
}

export class WorkContextTraceParamsDto {
  traceId!: string;
}

export class WorkContextPersistedResponseDto {
  status!: "persisted";
  traceId!: string;
  contextBundleId!: string;
  memoryId!: string;
  runEventIds!: string[];
}

export class WorkContextTraceSummaryDto implements WorkContextPersistenceSummary {
  traceId!: string;
  projectId!: string;
  contextBundleIds!: string[];
  memoryIds!: string[];
  memoryLinks!: Array<{ targetKind: string; targetId: string }>;
  runEvents!: Array<{
    id: string;
    runId: string;
    sequence: number;
    domain: string;
    mutationType: string;
    targetKind: string;
    targetId: string;
  }>;
}
