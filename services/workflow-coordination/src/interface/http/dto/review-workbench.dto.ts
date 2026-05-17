import type { ReviewWorkbenchInput } from "@planning-review/application/reviews/review-workbench.ts";
import type {
  ConfiguredUatCodeReviewDecisionInput,
  FinalQaFeedbackGateInput,
  FinalQaReportInput,
  GeneratedE2eRegressionRunInput,
  ReviewWorkbenchSessionAnnotationInput,
  ReviewWorkbenchSessionLoadInput,
  ReviewWorkbenchSessionSaveInput,
  UatCodeReviewDecisionInput,
  UatCodeReviewHandoffInput,
} from "@workflow-coordination/application/review-workbench.service.ts";

export class ReviewWorkbenchRequestDto implements ReviewWorkbenchInput {
  projectId?: string;
  traceId?: string;
  reviewId?: string;
  files!: ReviewWorkbenchInput["files"];
  annotations!: ReviewWorkbenchInput["annotations"];
  selectedFilePath?: string | null;
  viewedFilePaths?: string[];
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
  liveLog?: ReviewWorkbenchInput["liveLog"];
  editorAnnotations?: ReviewWorkbenchInput["editorAnnotations"];
  currentPrUrl?: string;
  currentPrMeta?: ReviewWorkbenchInput["currentPrMeta"];
}

export class ReviewWorkbenchSessionSaveRequestDto
  implements ReviewWorkbenchSessionSaveInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  reviewId?: string;
  reviewType?: ReviewWorkbenchSessionSaveInput["reviewType"];
  title?: string;
  files!: ReviewWorkbenchInput["files"];
  annotations!: ReviewWorkbenchInput["annotations"];
  selectedFilePath?: string | null;
  viewedFilePaths?: string[];
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
  liveLog?: ReviewWorkbenchInput["liveLog"];
  editorAnnotations?: ReviewWorkbenchInput["editorAnnotations"];
  currentPrUrl?: string;
  currentPrMeta?: ReviewWorkbenchInput["currentPrMeta"];
}

export class ReviewWorkbenchSessionLoadRequestDto
  implements ReviewWorkbenchSessionLoadInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  reviewId?: string;
  traceId?: string;
  selectedFilePath?: string | null;
  viewedFilePaths?: string[];
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
}

export class ReviewWorkbenchSessionAnnotateRequestDto
  implements ReviewWorkbenchSessionAnnotationInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  reviewId?: string;
  traceId?: string;
  annotationId?: string;
  type?: ReviewWorkbenchSessionAnnotationInput["type"];
  scope?: ReviewWorkbenchSessionAnnotationInput["scope"];
  filePath!: string;
  lineStart!: number;
  lineEnd!: number;
  side?: ReviewWorkbenchSessionAnnotationInput["side"];
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  severity?: ReviewWorkbenchSessionAnnotationInput["severity"];
  conventionalLabel?: string;
  decorations?: ReviewWorkbenchSessionAnnotationInput["decorations"];
  author?: string;
  source?: string;
  createdAt?: number;
  selectedFilePath?: string | null;
  viewedFilePaths?: string[];
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
}

export class FinalQaReportRequestDto implements FinalQaReportInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  taskIds?: string[];
}

export class FinalQaFeedbackGateRequestDto implements FinalQaFeedbackGateInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  taskIds?: string[];
  workerId?: string | null;
  reviewerAgent?: string | null;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  maxIterations?: number | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export class UatCodeReviewHandoffRequestDto implements UatCodeReviewHandoffInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  taskIds?: string[];
}

export class UatCodeReviewDecisionRequestDto implements UatCodeReviewDecisionInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  taskIds?: string[];
  decision!: UatCodeReviewDecisionInput["decision"];
  reviewType!: UatCodeReviewDecisionInput["reviewType"];
  feedbackText?: string;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  e2eRunner?: UatCodeReviewDecisionInput["e2eRunner"];
}

export class ConfiguredUatCodeReviewDecisionRequestDto
  implements ConfiguredUatCodeReviewDecisionInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  taskIds?: string[];
}

export class GeneratedE2eRegressionRunRequestDto
  implements GeneratedE2eRegressionRunInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  traceId?: string;
  taskIds?: string[];
  runner?: GeneratedE2eRegressionRunInput["runner"];
  planOnly?: boolean;
}
