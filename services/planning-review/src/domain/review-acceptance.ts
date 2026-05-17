export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export type FinalQaStatus = "passed" | "failed";
export type FinalQaCheckStatus = "pass" | "fail" | "warn";
export type FinalQaNextAction =
  | "prompt_uat_code_review"
  | "continue_automated_feedback"
  | "manual_review_required";

export interface BuildFinalQaReportInput {
  projectId: string;
  traceId?: string;
  taskIds?: string[];
}

export interface FinalQaCheck {
  id: string;
  label: string;
  status: FinalQaCheckStatus;
  details: string;
  subjectKind?: "project" | "task" | "doc" | "agent_run" | "artifact";
  subjectId?: string | null;
}

export interface FinalQaTaskResult {
  taskId: string;
  title: string;
  status: string | null;
  successCriteria: string[];
  latestVerdict: "APPROVE" | "REVISE" | "RETHINK" | "UNAVAILABLE" | null;
  latestReviewEventId: string | null;
  unresolvedDependencyIds: string[];
  runIds: string[];
  openFeedbackRunIds: string[];
  artifactIds: string[];
}

export interface FinalQaReportOutput {
  projectId: string;
  traceId?: string;
  status: FinalQaStatus;
  readyForUserAcceptance: boolean;
  nextAction: FinalQaNextAction;
  summary: {
    taskCount: number;
    docCount: number;
    runCount: number;
    artifactCount: number;
    successCriteriaCount: number;
    approvedTaskCount: number;
    blockedTaskCount: number;
    openFeedbackRunCount: number;
  };
  checks: FinalQaCheck[];
  taskResults: FinalQaTaskResult[];
  markdown: string;
}

export type UatCodeReviewHandoffStatus = "ready" | "blocked";
export type UatCodeReviewHandoffNextAction =
  | "prompt_user_for_uat_code_review"
  | FinalQaNextAction;
export type UatCodeReviewSessionType = "uat" | "code_review";
export type UatCodeReviewSessionStatus = "pending_user_decision";

export interface BuildUatCodeReviewHandoffInput {
  projectId: string;
  traceId?: string;
  taskIds?: string[];
}

export interface UatCodeReviewSession {
  id: string;
  type: UatCodeReviewSessionType;
  title: string;
  status: UatCodeReviewSessionStatus;
  traceId?: string;
  taskIds: string[];
  promptMarkdown: string;
}

export interface UatCodeReviewDecisionOption {
  id:
    | "start_uat"
    | "start_code_review"
    | "request_changes"
    | "approve_without_manual_review"
    | "continue_automated_feedback"
    | "manual_review_required";
  label: string;
  description: string;
}

export interface UatCodeReviewHandoffOutput {
  projectId: string;
  traceId?: string;
  status: UatCodeReviewHandoffStatus;
  finalQaStatus: FinalQaStatus;
  nextAction: UatCodeReviewHandoffNextAction;
  finalQa: FinalQaReportOutput;
  reviewSessions: UatCodeReviewSession[];
  decisionOptions: UatCodeReviewDecisionOption[];
  promptMarkdown: string;
  eventId: string;
}

export type UatCodeReviewDecision =
  | "start_uat"
  | "start_code_review"
  | "request_changes"
  | "approve_without_manual_review";
export type UatCodeReviewDecisionStatus = "review_started" | "changes_requested" | "approved" | "blocked";
export type UatCodeReviewDecisionNextAction =
  | "await_user_feedback"
  | "feedback_run_scheduled"
  | "real_data_e2e_generated"
  | "manual_review_required";

export interface RecordUatCodeReviewDecisionInput {
  projectId: string;
  traceId?: string;
  decision: UatCodeReviewDecision;
  reviewType: UatCodeReviewSessionType;
  feedbackText?: string;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  taskIds?: string[];
  e2eRunner?: GeneratedE2eRegressionRunner;
}

export interface UatCodeReviewFeedbackRun {
  id: string;
  taskId: string;
  agent: string;
  status: string;
}

export interface GeneratedE2eRegressionTest {
  artifactId: string;
  filename: string;
  path: string;
  runner: GeneratedE2eRegressionRunner;
  storePath: string;
  bodyPath: string;
  mime: string;
  body: string;
  sourceTaskIds: string[];
  sourceCriteria: string[];
  coverageCases: GeneratedE2eCoverageCase[];
  ciCommand: string[];
  ciEnv: Record<string, string>;
}

export interface GeneratedE2eCoverageCase {
  id: string;
  taskId: string;
  taskTitle: string;
  criterion: string;
  artifactIds: string[];
  runIds: string[];
  latestReviewEventId: string | null;
}

export interface UatCodeReviewDecisionOutput {
  projectId: string;
  traceId?: string;
  decision: UatCodeReviewDecision;
  reviewType: UatCodeReviewSessionType;
  status: UatCodeReviewDecisionStatus;
  nextAction: UatCodeReviewDecisionNextAction;
  handoff: UatCodeReviewHandoffOutput;
  feedbackRuns: UatCodeReviewFeedbackRun[];
  generatedE2eTests: GeneratedE2eRegressionTest[];
  eventId: string;
}

export type ConfiguredUatCodeReviewDecisionStatus =
  | "not_configured"
  | "disabled"
  | "applied"
  | "blocked";
export type ConfiguredUatCodeReviewDecisionNextAction =
  | "configure_auto_decision"
  | "manual_review_required"
  | UatCodeReviewDecisionNextAction;

export interface UatCodeReviewAutoDecisionConfig {
  enabled: boolean;
  decision: UatCodeReviewDecision;
  reviewType: UatCodeReviewSessionType;
  feedbackText?: string;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  taskIds?: string[];
  e2eRunner?: GeneratedE2eRegressionRunner;
}

export interface ApplyConfiguredUatCodeReviewDecisionInput {
  projectId: string;
  traceId?: string;
  taskIds?: string[];
}

export interface ConfiguredUatCodeReviewDecisionOutput {
  projectId: string;
  traceId?: string;
  settingKey: string;
  status: ConfiguredUatCodeReviewDecisionStatus;
  nextAction: ConfiguredUatCodeReviewDecisionNextAction;
  config: UatCodeReviewAutoDecisionConfig | null;
  decision: UatCodeReviewDecisionOutput | null;
  eventId: string;
}

export interface RunGeneratedE2eRegressionTestsInput {
  projectId: string;
  traceId?: string;
  runner?: GeneratedE2eRegressionRunner;
  planOnly?: boolean;
}

export type GeneratedE2eRegressionRunner = "bun" | "playwright";
export type GeneratedE2eRegressionRunStatus = "passed" | "failed" | "planned";

export interface GeneratedE2eRegressionRunOutput {
  projectId: string;
  traceId?: string;
  runner: GeneratedE2eRegressionRunner;
  status: GeneratedE2eRegressionRunStatus;
  command: string[];
  cwd?: string;
  testFiles: string[];
  artifactIds: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ciCommand: string[];
  ciEnv: Record<string, string>;
  eventId: string;
}
