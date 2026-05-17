import type { DependencyRunPreviewInput } from "@execution-orchestration/domain/dependency-run-preview.ts";
import type {
  DependencyRunDispatchInput,
  DependencyRunLiveFeedbackInput,
  DependencyRunLifecycleEventInput,
  DependencyRunPreviewRequest,
  DependencyRunWorkerTickInput,
  AutomatedFeedbackLoopInput,
  TaskQaReviewInput,
} from "@workflow-coordination/application/dependency-execution.service.ts";

export class DependencyRunPreviewRequestDto implements DependencyRunPreviewRequest {
  mode!: DependencyRunPreviewInput["mode"];
  targetTaskIds!: string[];
  projectId?: string;
  tasks?: DependencyRunPreviewInput["tasks"];
  traceId?: string;
}

export class DependencyRunDispatchRequestDto implements DependencyRunDispatchInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  mode!: DependencyRunDispatchInput["mode"];
  targetTaskIds!: string[];
  traceId?: string;
  agent!: string;
  model?: string | null;
  prompt?: string | null;
}

export class DependencyRunLiveFeedbackRequestDto implements DependencyRunLiveFeedbackInput {
  projectId!: string;
  traceId?: string | null;
  runGroupId?: string | null;
  runId?: string | null;
  taskId?: string | null;
}

export class DependencyRunLiveFeedbackStreamQueryDto extends DependencyRunLiveFeedbackRequestDto {
  once?: string | boolean | null;
  pollMs?: string | number | null;
}

export class DependencyRunLifecycleEventRequestDto implements DependencyRunLifecycleEventInput {
  projectId!: string;
  traceId?: string | null;
  runId!: string;
  taskId?: string | null;
  status!: string;
  domain!: string;
  mutationType!: string;
  targetKind!: string;
  targetId!: string;
  agentId?: string | null;
  taskLineageId?: string | null;
  summary?: string | null;
  output?: string | null;
  payload?: Record<string, unknown> | null;
}

export class DependencyRunWorkerTickRequestDto implements DependencyRunWorkerTickInput {
  projectId!: string;
  traceId?: string | null;
  runGroupId?: string | null;
  workerId?: string | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export class AutomatedFeedbackLoopRequestDto implements AutomatedFeedbackLoopInput {
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  workspaceName?: string | null;
  projectId!: string;
  projectSlug?: string | null;
  projectName?: string | null;
  traceId?: string | null;
  runGroupId?: string | null;
  reviewType?: AutomatedFeedbackLoopInput["reviewType"];
  reviewerAgent?: string | null;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  workerId?: string | null;
  maxIterations?: number | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export class TaskQaReviewRequestDto implements TaskQaReviewInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  taskId!: string;
  runId?: string | null;
  traceId?: string;
  reviewType!: TaskQaReviewInput["reviewType"];
  reviewerAgent?: string | null;
  reviewText!: string;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  baseline?: string | null;
  checkpointId?: string | null;
  summary?: string | null;
}
