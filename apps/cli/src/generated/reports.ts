import { Command, Option } from "commander";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";
import { createReportApiCallerFromEnv } from "@work-management/interface/http/report-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createReportsCommand(): Command {
  const command = new Command("reports");
  command.description("Generated reports commands.");

  const appendReviewWorkbenchAnnotationCommand = command.command("append-review-workbench-annotation");
  appendReviewWorkbenchAnnotationCommand.description("reports appendReviewWorkbenchAnnotation");
  appendReviewWorkbenchAnnotationCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(appendReviewWorkbenchAnnotationCommand);
  appendReviewWorkbenchAnnotationCommand.option("--trace-id <string>", "trace-id");
  appendReviewWorkbenchAnnotationCommand.option("--review-id <string>", "review-id");
  appendReviewWorkbenchAnnotationCommand.option("--annotation-id <string>", "annotation-id");
  appendReviewWorkbenchAnnotationCommand.addOption(new Option("--type <choice>", "type").choices(["comment", "suggestion"]));
  appendReviewWorkbenchAnnotationCommand.addOption(new Option("--scope <choice>", "scope").choices(["line", "file"]));
  appendReviewWorkbenchAnnotationCommand.option("--file-path <string>", "file-path");
  appendReviewWorkbenchAnnotationCommand.option("--line-start <number>", "line-start", Number.parseFloat);
  appendReviewWorkbenchAnnotationCommand.option("--line-end <number>", "line-end", Number.parseFloat);
  appendReviewWorkbenchAnnotationCommand.addOption(new Option("--side <choice>", "side").choices(["old", "new"]));
  appendReviewWorkbenchAnnotationCommand.option("--text <string>", "text");
  appendReviewWorkbenchAnnotationCommand.option("--suggested-code <string>", "suggested-code");
  appendReviewWorkbenchAnnotationCommand.option("--original-code <string>", "original-code");
  appendReviewWorkbenchAnnotationCommand.option("--severity <string>", "severity");
  appendReviewWorkbenchAnnotationCommand.option("--conventional-label <string>", "conventional-label");
  appendReviewWorkbenchAnnotationCommand.option("--decorations-json <json>", "decorations JSON array");
  appendReviewWorkbenchAnnotationCommand.option("--author <string>", "author");
  appendReviewWorkbenchAnnotationCommand.option("--source <string>", "source");
  appendReviewWorkbenchAnnotationCommand.option("--created-at <number>", "created-at", Number.parseFloat);
  appendReviewWorkbenchAnnotationCommand.option("--selected-file-path <string>", "selected-file-path");
  appendReviewWorkbenchAnnotationCommand.option("--viewed-file-paths <paths>", "comma-separated viewed file paths");
  appendReviewWorkbenchAnnotationCommand.option("--hide-viewed-files", "hide-viewed-files");
  appendReviewWorkbenchAnnotationCommand.option("--search-query <string>", "search-query");
  appendReviewWorkbenchAnnotationCommand.option("--active-search-match-id <string>", "active-search-match-id");
  appendReviewWorkbenchAnnotationCommand.option("--payload-json <json>", "request payload JSON object");
  appendReviewWorkbenchAnnotationCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().appendReviewWorkbenchAnnotation(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        reviewId: options.reviewId,
        annotationId: options.annotationId,
        type: options.type,
        scope: options.scope,
        filePath: requiredOption(options, "filePath"),
        lineStart: requiredNumberOption(options, "lineStart"),
        lineEnd: requiredNumberOption(options, "lineEnd"),
        side: options.side,
        text: options.text,
        suggestedCode: options.suggestedCode,
        originalCode: options.originalCode,
        severity: options.severity,
        conventionalLabel: options.conventionalLabel,
        decorations: jsonArrayOption(options, "decorationsJson"),
        author: options.author,
        source: options.source,
        createdAt: options.createdAt,
        selectedFilePath: options.selectedFilePath,
        viewedFilePaths: csvOption(options, "viewedFilePaths"),
        hideViewedFiles: options.hideViewedFiles,
        searchQuery: options.searchQuery,
        activeSearchMatchId: options.activeSearchMatchId,
      })))
    );
  });

  const applyConfiguredUatCodeReviewDecisionCommand = command.command("apply-configured-uat-code-review-decision");
  applyConfiguredUatCodeReviewDecisionCommand.description("reports applyConfiguredUatCodeReviewDecision");
  applyConfiguredUatCodeReviewDecisionCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(applyConfiguredUatCodeReviewDecisionCommand);
  applyConfiguredUatCodeReviewDecisionCommand.option("--trace-id <string>", "trace-id");
  applyConfiguredUatCodeReviewDecisionCommand.option("--task-ids <ids>", "comma-separated task ids");
  applyConfiguredUatCodeReviewDecisionCommand.option("--payload-json <json>", "request payload JSON object");
  applyConfiguredUatCodeReviewDecisionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().applyConfiguredUatCodeReviewDecision(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        taskIds: csvOption(options, "taskIds"),
      })))
    );
  });

  const burndownCommand = command.command("burndown");
  burndownCommand.description("reports burndown");
  burndownCommand.option("--json", "Emit JSON output");
  burndownCommand.option("--project-id <string>", "project-id");
  burndownCommand.option("--sprint-id <string>", "sprint-id");
  burndownCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await reportClient().burndown(compact({
        projectId: requiredOption(options, "projectId"),
        sprintId: options.sprintId,
      }))
    );
  });

  const finalQaCommand = command.command("final-qa");
  finalQaCommand.description("reports finalQa");
  finalQaCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(finalQaCommand);
  finalQaCommand.option("--trace-id <string>", "trace-id");
  finalQaCommand.option("--task-ids <ids>", "comma-separated task ids");
  finalQaCommand.option("--payload-json <json>", "request payload JSON object");
  finalQaCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().finalQa(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        taskIds: csvOption(options, "taskIds"),
      })))
    );
  });

  const finalQaFeedbackGateCommand = command.command("final-qa-feedback-gate");
  finalQaFeedbackGateCommand.description("reports finalQaFeedbackGate");
  finalQaFeedbackGateCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(finalQaFeedbackGateCommand);
  finalQaFeedbackGateCommand.option("--trace-id <string>", "trace-id");
  finalQaFeedbackGateCommand.option("--task-ids <ids>", "comma-separated task ids");
  finalQaFeedbackGateCommand.option("--worker-id <string>", "worker-id");
  finalQaFeedbackGateCommand.option("--reviewer-agent <string>", "reviewer-agent");
  finalQaFeedbackGateCommand.option("--feedback-agent <string>", "feedback-agent");
  finalQaFeedbackGateCommand.option("--feedback-model <string>", "feedback-model");
  finalQaFeedbackGateCommand.option("--max-iterations <number>", "max-iterations", Number.parseFloat);
  finalQaFeedbackGateCommand.option("--cwd <string>", "cwd");
  finalQaFeedbackGateCommand.option("--copy-to-worktree <paths>", "comma-separated paths to copy to worktree");
  finalQaFeedbackGateCommand.option("--payload-json <json>", "request payload JSON object");
  finalQaFeedbackGateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().finalQaFeedbackGate(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        taskIds: csvOption(options, "taskIds"),
        workerId: options.workerId,
        reviewerAgent: options.reviewerAgent,
        feedbackAgent: options.feedbackAgent,
        feedbackModel: options.feedbackModel,
        maxIterations: options.maxIterations,
        cwd: options.cwd,
        copyToWorktree: csvOption(options, "copyToWorktree"),
      })))
    );
  });

  const loadReviewWorkbenchSessionCommand = command.command("load-review-workbench-session");
  loadReviewWorkbenchSessionCommand.description("reports loadReviewWorkbenchSession");
  loadReviewWorkbenchSessionCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(loadReviewWorkbenchSessionCommand);
  loadReviewWorkbenchSessionCommand.option("--trace-id <string>", "trace-id");
  loadReviewWorkbenchSessionCommand.option("--review-id <string>", "review-id");
  loadReviewWorkbenchSessionCommand.option("--selected-file-path <string>", "selected-file-path");
  loadReviewWorkbenchSessionCommand.option("--viewed-file-paths <paths>", "comma-separated viewed file paths");
  loadReviewWorkbenchSessionCommand.option("--hide-viewed-files", "hide-viewed-files");
  loadReviewWorkbenchSessionCommand.option("--search-query <string>", "search-query");
  loadReviewWorkbenchSessionCommand.option("--active-search-match-id <string>", "active-search-match-id");
  loadReviewWorkbenchSessionCommand.option("--payload-json <json>", "request payload JSON object");
  loadReviewWorkbenchSessionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().loadReviewWorkbenchSession(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        reviewId: options.reviewId,
        selectedFilePath: options.selectedFilePath,
        viewedFilePaths: csvOption(options, "viewedFilePaths"),
        hideViewedFiles: options.hideViewedFiles,
        searchQuery: options.searchQuery,
        activeSearchMatchId: options.activeSearchMatchId,
      })))
    );
  });

  const recordUatCodeReviewDecisionCommand = command.command("record-uat-code-review-decision");
  recordUatCodeReviewDecisionCommand.description("reports recordUatCodeReviewDecision");
  recordUatCodeReviewDecisionCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(recordUatCodeReviewDecisionCommand);
  recordUatCodeReviewDecisionCommand.addOption(new Option("--decision <choice>", "decision").choices(["start_uat", "start_code_review", "request_changes", "approve_without_manual_review"]));
  recordUatCodeReviewDecisionCommand.addOption(new Option("--e2e-runner <choice>", "e2e-runner").choices(["bun", "playwright"]));
  recordUatCodeReviewDecisionCommand.option("--feedback-agent <string>", "feedback-agent");
  recordUatCodeReviewDecisionCommand.option("--feedback-model <string>", "feedback-model");
  recordUatCodeReviewDecisionCommand.option("--feedback-text <string>", "feedback-text");
  recordUatCodeReviewDecisionCommand.addOption(new Option("--review-type <choice>", "review-type").choices(["uat", "code_review"]));
  recordUatCodeReviewDecisionCommand.option("--trace-id <string>", "trace-id");
  recordUatCodeReviewDecisionCommand.option("--task-ids <ids>", "comma-separated task ids");
  recordUatCodeReviewDecisionCommand.option("--payload-json <json>", "request payload JSON object");
  recordUatCodeReviewDecisionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().recordUatCodeReviewDecision(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        taskIds: csvOption(options, "taskIds"),
        decision: requiredOption(options, "decision"),
        reviewType: requiredOption(options, "reviewType"),
        feedbackText: options.feedbackText,
        feedbackAgent: options.feedbackAgent,
        feedbackModel: options.feedbackModel,
        e2eRunner: options.e2eRunner,
      })))
    );
  });

  const reviewWorkbenchCommand = command.command("review-workbench");
  reviewWorkbenchCommand.description("reports reviewWorkbench");
  reviewWorkbenchCommand.option("--json", "Emit JSON output");
  reviewWorkbenchCommand.option("--active-search-match-id <string>", "active-search-match-id");
  reviewWorkbenchCommand.option("--annotations-json <json>", "annotations JSON array");
  reviewWorkbenchCommand.option("--current-pr-meta-number <number>", "current-pr-meta-number", Number.parseFloat);
  reviewWorkbenchCommand.option("--current-pr-meta-repo <string>", "current-pr-meta-repo");
  reviewWorkbenchCommand.option("--current-pr-meta-title <string>", "current-pr-meta-title");
  reviewWorkbenchCommand.option("--current-pr-url <string>", "current-pr-url");
  reviewWorkbenchCommand.option("--editor-annotations-json <json>", "editor annotations JSON array");
  reviewWorkbenchCommand.option("--files-json <json>", "files JSON array");
  reviewWorkbenchCommand.option("--hide-viewed-files", "hide-viewed-files");
  reviewWorkbenchCommand.option("--live-log-content <string>", "live-log-content");
  reviewWorkbenchCommand.option("--live-log-is-live", "live-log-is-live");
  reviewWorkbenchCommand.option("--live-log-max-render-size <number>", "live-log-max-render-size", Number.parseFloat);
  reviewWorkbenchCommand.option("--project-id <string>", "project-id");
  reviewWorkbenchCommand.option("--review-id <string>", "review-id");
  reviewWorkbenchCommand.option("--search-query <string>", "search-query");
  reviewWorkbenchCommand.option("--selected-file-path <string>", "selected-file-path");
  reviewWorkbenchCommand.option("--trace-id <string>", "trace-id");
  reviewWorkbenchCommand.option("--viewed-file-paths <paths>", "comma-separated viewed file paths");
  reviewWorkbenchCommand.option("--payload-json <json>", "request payload JSON object");
  reviewWorkbenchCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().reviewWorkbench(requireArrayField(defaultArrayField(mergePayload(options, compact({
        projectId: options.projectId,
        traceId: options.traceId,
        reviewId: options.reviewId,
        files: jsonArrayOption(options, "filesJson"),
        annotations: jsonArrayOption(options, "annotationsJson") ?? [],
        selectedFilePath: options.selectedFilePath,
        viewedFilePaths: csvOption(options, "viewedFilePaths"),
        hideViewedFiles: options.hideViewedFiles,
        searchQuery: options.searchQuery,
        activeSearchMatchId: options.activeSearchMatchId,
        liveLog: liveLogOption(options),
        editorAnnotations: jsonArrayOption(options, "editorAnnotationsJson"),
        currentPrUrl: options.currentPrUrl,
        currentPrMeta: currentPrMetaOption(options),
      })), "annotations"), "files"))
    );
  });

  const runGeneratedE2eRegressionTestsCommand = command.command("run-generated-e2e-regression-tests");
  runGeneratedE2eRegressionTestsCommand.description("reports runGeneratedE2eRegressionTests");
  runGeneratedE2eRegressionTestsCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(runGeneratedE2eRegressionTestsCommand);
  runGeneratedE2eRegressionTestsCommand.option("--plan-only", "plan-only");
  runGeneratedE2eRegressionTestsCommand.addOption(new Option("--runner <choice>", "runner").choices(["bun", "playwright"]));
  runGeneratedE2eRegressionTestsCommand.option("--trace-id <string>", "trace-id");
  runGeneratedE2eRegressionTestsCommand.option("--task-ids <ids>", "comma-separated task ids");
  runGeneratedE2eRegressionTestsCommand.option("--payload-json <json>", "request payload JSON object");
  runGeneratedE2eRegressionTestsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().runGeneratedE2eRegressionTests(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        taskIds: csvOption(options, "taskIds"),
        runner: options.runner,
        planOnly: options.planOnly,
      })))
    );
  });

  const saveReviewWorkbenchSessionCommand = command.command("save-review-workbench-session");
  saveReviewWorkbenchSessionCommand.description("reports saveReviewWorkbenchSession");
  saveReviewWorkbenchSessionCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(saveReviewWorkbenchSessionCommand);
  saveReviewWorkbenchSessionCommand.option("--trace-id <string>", "trace-id");
  saveReviewWorkbenchSessionCommand.option("--review-id <string>", "review-id");
  saveReviewWorkbenchSessionCommand.addOption(new Option("--review-type <choice>", "review-type").choices(["plan", "uat", "code_review"]));
  saveReviewWorkbenchSessionCommand.option("--title <string>", "title");
  saveReviewWorkbenchSessionCommand.option("--files-json <json>", "files JSON array");
  saveReviewWorkbenchSessionCommand.option("--annotations-json <json>", "annotations JSON array");
  saveReviewWorkbenchSessionCommand.option("--selected-file-path <string>", "selected-file-path");
  saveReviewWorkbenchSessionCommand.option("--viewed-file-paths <paths>", "comma-separated viewed file paths");
  saveReviewWorkbenchSessionCommand.option("--hide-viewed-files", "hide-viewed-files");
  saveReviewWorkbenchSessionCommand.option("--search-query <string>", "search-query");
  saveReviewWorkbenchSessionCommand.option("--active-search-match-id <string>", "active-search-match-id");
  saveReviewWorkbenchSessionCommand.option("--live-log-content <string>", "live-log-content");
  saveReviewWorkbenchSessionCommand.option("--live-log-is-live", "live-log-is-live");
  saveReviewWorkbenchSessionCommand.option("--live-log-max-render-size <number>", "live-log-max-render-size", Number.parseFloat);
  saveReviewWorkbenchSessionCommand.option("--editor-annotations-json <json>", "editor annotations JSON array");
  saveReviewWorkbenchSessionCommand.option("--current-pr-url <string>", "current-pr-url");
  saveReviewWorkbenchSessionCommand.option("--current-pr-meta-number <number>", "current-pr-meta-number", Number.parseFloat);
  saveReviewWorkbenchSessionCommand.option("--current-pr-meta-repo <string>", "current-pr-meta-repo");
  saveReviewWorkbenchSessionCommand.option("--current-pr-meta-title <string>", "current-pr-meta-title");
  saveReviewWorkbenchSessionCommand.option("--payload-json <json>", "request payload JSON object");
  saveReviewWorkbenchSessionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().saveReviewWorkbenchSession(requireArrayField(defaultArrayField(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        reviewId: options.reviewId,
        reviewType: options.reviewType,
        title: options.title,
        files: jsonArrayOption(options, "filesJson"),
        annotations: jsonArrayOption(options, "annotationsJson") ?? [],
        selectedFilePath: options.selectedFilePath,
        viewedFilePaths: csvOption(options, "viewedFilePaths"),
        hideViewedFiles: options.hideViewedFiles,
        searchQuery: options.searchQuery,
        activeSearchMatchId: options.activeSearchMatchId,
        liveLog: liveLogOption(options),
        editorAnnotations: jsonArrayOption(options, "editorAnnotationsJson"),
        currentPrUrl: options.currentPrUrl,
        currentPrMeta: currentPrMetaOption(options),
      })), "annotations"), "files"))
    );
  });

  const uatCodeReviewHandoffCommand = command.command("uat-code-review-handoff");
  uatCodeReviewHandoffCommand.description("reports uatCodeReviewHandoff");
  uatCodeReviewHandoffCommand.option("--json", "Emit JSON output");
  addWorkflowMetadataOptions(uatCodeReviewHandoffCommand);
  uatCodeReviewHandoffCommand.option("--trace-id <string>", "trace-id");
  uatCodeReviewHandoffCommand.option("--task-ids <ids>", "comma-separated task ids");
  uatCodeReviewHandoffCommand.option("--payload-json <json>", "request payload JSON object");
  uatCodeReviewHandoffCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowReports().uatCodeReviewHandoff(mergePayload(options, compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        taskIds: csvOption(options, "taskIds"),
      })))
    );
  });

  return command;
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function reportClient() {
  const caller = createReportApiCallerFromEnv();
  if (!caller) {
    throw new Error("Report API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.reports;
}

function workflowReports() {
  const caller = createWorkflowApiCallerFromEnv();
  if (!caller) {
    throw new Error("Workflow API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.reports;
}

function addWorkflowMetadataOptions(command: Command): void {
  command.option("--project-id <string>", "project-id");
  command.option("--workspace-id <string>", "workspace-id");
  command.option("--workspace-slug <string>", "workspace-slug");
  command.option("--workspace-name <string>", "workspace-name");
  command.option("--project-slug <string>", "project-slug");
  command.option("--project-name <string>", "project-name");
}

function workflowMetadata(options: JsonRecord): JsonRecord {
  const projectId = requiredOption(options, "projectId");
  const workspaceId = stringOption(options, "workspaceId") ??
    process.env["FULCRUM_WORKSPACE_ID"] ??
    process.env["FULCRUM_ORG_ID"] ??
    "local-workspace";
  const workspaceSlug = stringOption(options, "workspaceSlug") ??
    process.env["FULCRUM_WORKSPACE_SLUG"] ??
    slugOf(workspaceId);
  const workspaceName = stringOption(options, "workspaceName") ??
    process.env["FULCRUM_WORKSPACE_NAME"] ??
    titleOf(workspaceSlug);
  return {
    workspaceId,
    workspaceSlug,
    workspaceName,
    projectId,
    projectSlug: stringOption(options, "projectSlug") ?? process.env["FULCRUM_PROJECT_SLUG"] ?? slugOf(projectId),
    projectName: stringOption(options, "projectName") ?? process.env["FULCRUM_PROJECT_NAME"] ?? titleOf(projectId),
  };
}

function mergePayload(options: JsonRecord, base: JsonRecord): JsonRecord {
  return compact({
    ...base,
    ...jsonObjectOption(options, "payloadJson"),
  });
}

function requireArrayField(input: JsonRecord, key: string): JsonRecord {
  if (!Array.isArray(input[key])) throw new Error(`${key} is required.`);
  return input;
}

function defaultArrayField(input: JsonRecord, key: string): JsonRecord {
  if (input[key] === undefined) input[key] = [];
  if (!Array.isArray(input[key])) throw new Error(`${key} must be a JSON array.`);
  return input;
}

function liveLogOption(options: JsonRecord): JsonRecord | undefined {
  const liveLog = compact({
    content: options.liveLogContent,
    isLive: options.liveLogIsLive,
    maxRenderSize: options.liveLogMaxRenderSize,
  });
  return Object.keys(liveLog).length > 0 ? liveLog : undefined;
}

function currentPrMetaOption(options: JsonRecord): JsonRecord | undefined {
  const meta = compact({
    number: options.currentPrMetaNumber,
    repo: options.currentPrMetaRepo,
    title: options.currentPrMetaTitle,
  });
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function jsonObjectOption(options: JsonRecord, key: string): JsonRecord | undefined {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON object.`);
  }
  return parsed as JsonRecord;
}

function jsonArrayOption(options: JsonRecord, key: string): unknown[] | undefined {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a JSON array.`);
  return parsed;
}

function csvOption(options: JsonRecord, key: string): string[] {
  return (stringOption(options, key) ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function requiredOption(options: JsonRecord, key: string): string {
  const value = stringOption(options, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requiredNumberOption(options: JsonRecord, key: string): number {
  const value = options[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${key} is required.`);
}

function stringOption(options: JsonRecord, key: string): string | null {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function slugOf(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "local";
}

function titleOf(value: string): string {
  return value.split(/[-_\s]+/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Local";
}
