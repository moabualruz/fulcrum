import { z } from "zod";

export * from "@work-management/application/work-item-schema.ts";

const nullableString = z.string().nullable().optional();

export const PreviewDependencyRunInputSchema = z.object({
  mode: z.enum(["task", "board"]).default("task"),
  targetTaskIds: z.array(z.uuid()).min(1),
  projectId: nullableString,
  traceId: z.string().optional(),
});

export const DispatchDependencyRunInputSchema = PreviewDependencyRunInputSchema.extend({
  agent: z.string().trim().min(1),
  model: nullableString,
  prompt: nullableString,
});

const DependencyPreviewTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  column: z.string(),
  selected: z.boolean(),
  dependencyDepth: z.number().int(),
  dependencyIds: z.array(z.string()),
  blockers: z.array(z.string()),
});

export const DependencyRunPreviewOutputSchema = z.object({
  mode: z.string(),
  targetTaskIds: z.array(z.string()),
  orderedTaskIds: z.array(z.string()),
  omittedTaskIds: z.array(z.string()),
  missingTaskIds: z.array(z.string()),
  blocked: z.boolean(),
  requiresDisclosure: z.literal(true),
  warnings: z.array(z.string()),
  tasks: z.array(DependencyPreviewTaskSchema),
  traceId: z.string().optional(),
});

export const DispatchDependencyRunOutputSchema = z.object({
  runGroupId: z.string(),
  preview: DependencyRunPreviewOutputSchema,
  scheduledRuns: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    agent: z.string(),
    status: z.string(),
    queuePosition: z.number().int(),
    dependencyIds: z.array(z.string()),
  })),
  skippedTasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    column: z.string(),
    reason: z.string(),
  })),
  warnings: z.array(z.string()),
});

export const DependencyRunLiveFeedbackInputSchema = z.object({
  projectId: nullableString,
  traceId: nullableString,
  runGroupId: nullableString,
  runId: nullableString,
  taskId: nullableString,
});

const DependencyRunExecutorStatusSchema = z.object({
  queuedTaskCount: z.number().int(),
  runningTaskCount: z.number().int(),
  succeededTaskCount: z.number().int(),
  failedTaskCount: z.number().int(),
  blockedTaskCount: z.number().int(),
  inReviewCount: z.number().int(),
  active: z.boolean(),
  lastActivityAt: z.string().nullable(),
});

const DependencyRunLiveRunSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  traceId: z.string(),
  status: z.string(),
  queuePosition: z.number().int(),
  dependencyIds: z.array(z.string()),
  latestEventSummary: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
});

const DependencyRunLiveEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  taskId: z.string().nullable(),
  traceId: z.string(),
  sequence: z.number().int(),
  domain: z.string(),
  mutationType: z.string(),
  targetKind: z.string(),
  targetId: z.string(),
  agentId: z.string().nullable(),
  taskLineageId: z.string().nullable(),
  summary: z.string(),
  output: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const DependencyRunLiveFeedbackSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  runGroupId: z.string(),
  fetchedAt: z.string(),
  executorStatus: DependencyRunExecutorStatusSchema,
  runs: z.array(DependencyRunLiveRunSchema),
  events: z.array(DependencyRunLiveEventSchema),
  latestEvent: DependencyRunLiveEventSchema.nullable(),
});

export const DependencyRunLiveFeedbackOutputSchema = DependencyRunLiveFeedbackSchema;

export const DependencyRunWorkerTickInputSchema = z.object({
  projectId: nullableString,
  traceId: nullableString,
  runGroupId: nullableString,
  workerId: nullableString,
  cwd: nullableString,
  copyToWorktree: z.array(z.string()).nullable().optional(),
});

export const DependencyRunWorkerTickOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  runGroupId: z.string(),
  workerId: z.string(),
  processedRun: z.object({
    id: z.string(),
    taskId: z.string().nullable(),
    traceId: z.string(),
    agent: z.string(),
    status: z.enum(["succeeded", "failed", "queued"]),
    output: z.string(),
    jobId: z.string(),
  }).nullable(),
  skippedReason: z.string().nullable(),
  feedback: DependencyRunLiveFeedbackSchema,
});

export const RecordTaskQaReviewInputSchema = z.object({
  taskId: z.uuid(),
  runId: nullableString,
  projectId: nullableString,
  traceId: z.string().optional(),
  reviewType: z.enum(["plan", "code", "spec"]),
  reviewerAgent: nullableString,
  reviewText: z.string().trim().min(1),
  feedbackAgent: nullableString,
  feedbackModel: nullableString,
  baseline: nullableString,
  checkpointId: nullableString,
  summary: nullableString,
});

const TaskQaReviewOutputSchema = z.object({
  taskId: z.string(),
  runId: z.string().nullable(),
  traceId: z.string().optional(),
  reviewType: z.enum(["plan", "code", "spec"]),
  reviewerAgent: z.string(),
  verdict: z.enum(["APPROVE", "REVISE", "RETHINK", "UNAVAILABLE"]),
  nextAction: z.enum(["ready_for_final_review", "feedback_run_scheduled", "manual_review_required"]),
  successCriteria: z.array(z.object({
    id: z.string(),
    text: z.string(),
  })),
  feedbackRun: z.object({
    id: z.string(),
    taskId: z.string(),
    agent: z.string(),
    status: z.string(),
  }).nullable(),
  recoveryPlan: z.unknown().nullable(),
  reviewFeed: z.unknown(),
});
export { TaskQaReviewOutputSchema };

export const AutomatedFeedbackLoopInputSchema = z.object({
  projectId: nullableString,
  traceId: nullableString,
  runGroupId: nullableString,
  reviewType: z.enum(["plan", "code", "spec"]).optional(),
  reviewerAgent: nullableString,
  feedbackAgent: nullableString,
  feedbackModel: nullableString,
  workerId: nullableString,
  maxIterations: z.number().int().positive().nullable().optional(),
  cwd: nullableString,
  copyToWorktree: z.array(z.string()).nullable().optional(),
});

export const AutomatedFeedbackLoopOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  runGroupId: z.string(),
  iterations: z.number().int(),
  processedRuns: z.array(z.object({
    id: z.string(),
    taskId: z.string().nullable(),
    status: z.enum(["succeeded", "failed", "queued"]),
    output: z.string(),
  })),
  reviews: z.array(TaskQaReviewOutputSchema),
  exhausted: z.boolean(),
  stopReason: z.enum([
    "automated_feedback_exhausted",
    "agent_run_failed",
    "max_iterations_reached",
    "manual_review_required",
    "reviewer_unavailable",
    "worker_waiting",
  ]),
  feedback: DependencyRunLiveFeedbackSchema,
});

export const ManualTaskWorkbenchInputSchema = z.object({
  projectId: nullableString,
  traceId: z.string().optional(),
  viewMode: z.enum(["board", "list", "table"]).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  projectCapabilities: z.object({ estimateEnabled: z.boolean().optional() }).optional(),
});

export const ManualTaskWorkbenchOutputSchema = z.object({
  projectId: z.string().nullable(),
  traceId: z.string().optional(),
  viewMode: z.enum(["board", "list", "table"]),
  layout: z.enum(["kanban", "list", "spreadsheet"]),
  filtersApplied: z.number().int(),
  accessSpecifiers: z.array(z.object({
    key: z.enum(["PUBLIC", "PRIVATE"]),
    i18nLabel: z.string(),
  })),
  columns: z.array(z.object({
    group: z.string(),
    label: z.string(),
    color: z.string(),
    taskIds: z.array(z.string()),
    count: z.number().int(),
  })),
  listRows: z.array(z.object({
    id: z.string(),
    traceId: z.string().optional(),
    projectId: z.string().nullable(),
    title: z.string(),
    status: z.string().nullable(),
    stateGroup: z.string(),
    stateLabel: z.string(),
    priority: z.number().nullable(),
    points: z.number().nullable(),
    assigneeId: z.string().nullable(),
    labels: z.array(z.string()),
    taskType: z.string(),
    cycleId: z.string().nullable(),
    moduleId: z.string().nullable(),
    parentId: z.string().nullable(),
    dependencyIds: z.array(z.string()),
    updatedAt: z.string(),
  })),
  table: z.object({
    visibleColumns: z.array(z.object({
      key: z.string(),
      label: z.string(),
    })),
    rows: z.array(z.object({
      id: z.string(),
      traceId: z.string().optional(),
      cells: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    })),
  }),
  emptyState: z.object({
    allTasksEmpty: z.boolean(),
    visibleTasksEmpty: z.boolean(),
    message: z.string(),
  }),
});
