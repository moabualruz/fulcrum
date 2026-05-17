export type {
  AppContext,
  ApplyConfiguredUatCodeReviewDecisionInput,
  BuildFinalQaReportInput,
  BuildUatCodeReviewHandoffInput,
  ConfiguredUatCodeReviewDecisionNextAction,
  ConfiguredUatCodeReviewDecisionOutput,
  ConfiguredUatCodeReviewDecisionStatus,
  FinalQaCheck,
  FinalQaCheckStatus,
  FinalQaNextAction,
  FinalQaReportOutput,
  FinalQaStatus,
  FinalQaTaskResult,
  GeneratedE2eCoverageCase,
  GeneratedE2eRegressionRunner,
  GeneratedE2eRegressionRunOutput,
  GeneratedE2eRegressionRunStatus,
  GeneratedE2eRegressionTest,
  RecordUatCodeReviewDecisionInput,
  RunGeneratedE2eRegressionTestsInput,
  UatCodeReviewAutoDecisionConfig,
  UatCodeReviewDecision,
  UatCodeReviewDecisionNextAction,
  UatCodeReviewDecisionOption,
  UatCodeReviewDecisionOutput,
  UatCodeReviewDecisionStatus,
  UatCodeReviewFeedbackRun,
  UatCodeReviewHandoffNextAction,
  UatCodeReviewHandoffOutput,
  UatCodeReviewHandoffStatus,
  UatCodeReviewSession,
  UatCodeReviewSessionStatus,
  UatCodeReviewSessionType,
} from "@planning-review/domain/review-acceptance.ts";

export interface ReportSnapshotDto {
  id: string;
  orgId: string;
  projectId: string;
  scopeType: string;
  completedCount: number;
  pointsCompleted: number;
  date: Date;
}

export interface CreateReportSnapshotInput {
  projectId: string;
  scopeType: "sprint" | "project" | "epic" | "workspace";
  scopeId?: string;
  date: Date;
  completedCount?: number;
  pointsCompleted?: number;
}

export type ReportScopeType = "sprint" | "project" | "epic" | "workspace";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface BurndownPoint {
  date: string;
  pointsRemaining: number;
  ideal: number;
}

export interface ReportBurndownInput {
  projectId: string;
  sprintId: string;
}

export interface ScopedReportInput {
  scopeType: ReportScopeType;
  scopeId?: string;
  dateRange: DateRange;
}

export interface ReportExportCsvInput extends ScopedReportInput {
  reportType:
    | "burndown"
    | "burnup"
    | "velocity"
    | "cfd"
    | "cycleTime"
    | "leadTime"
    | "throughput"
    | "wipOverTime"
    | "workload"
    | "blockedItems"
    | "staleIssues"
    | "progressRollup";
  lastN: number;
  thresholdDays: number;
}
