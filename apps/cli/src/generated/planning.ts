import { Command, Option } from "commander";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";

export function createPlanningCommand(): Command {
  const command = new Command("planning");
  command.description("Generated planning commands.");

  const buildFreeformDocsPlanningPromptCommand = command.command("build-freeform-docs-planning-prompt");
  buildFreeformDocsPlanningPromptCommand.description("planning buildFreeformDocsPlanningPrompt");
  buildFreeformDocsPlanningPromptCommand.option("--json", "Emit JSON output");
  buildFreeformDocsPlanningPromptCommand.option("--project-id <string>", "project-id");
  buildFreeformDocsPlanningPromptCommand.option("--user-prompt <string>", "user-prompt");
  buildFreeformDocsPlanningPromptCommand.option("--selected-doc-ids <ids>", "comma-separated selected doc ids");
  buildFreeformDocsPlanningPromptCommand.option("--trace-id <string>", "trace-id");
  buildFreeformDocsPlanningPromptCommand.option("--max-doc-chars <number>", "max-doc-chars", Number.parseFloat);
  buildFreeformDocsPlanningPromptCommand.action(async (options) => {
    try {
      const result = await planningClient().buildFreeformDocsPlanningPrompt(compact({
        projectId: requiredOption(options, "projectId"),
        userPrompt: requiredOption(options, "userPrompt"),
        selectedDocIds: csvOption(options, "selectedDocIds"),
        traceId: options.traceId,
        maxDocChars: options.maxDocChars,
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const generateTechnicalPlanningCycleCommand = command.command("generate-technical-planning-cycle");
  generateTechnicalPlanningCycleCommand.description("planning generateTechnicalPlanningCycle");
  generateTechnicalPlanningCycleCommand.option("--json", "Emit JSON output");
  generateTechnicalPlanningCycleCommand.addOption(new Option("--source <choice>", "source").choices(["freeform_docs", "guided_acp", "continuous_update"]));
  generateTechnicalPlanningCycleCommand.option("--project-id <string>", "project-id");
  generateTechnicalPlanningCycleCommand.option("--user-prompt <string>", "user-prompt");
  generateTechnicalPlanningCycleCommand.option("--selected-doc-ids <ids>", "comma-separated selected doc ids");
  generateTechnicalPlanningCycleCommand.option("--trace-id <string>", "trace-id");
  generateTechnicalPlanningCycleCommand.option("--max-doc-chars <number>", "max-doc-chars", Number.parseFloat);
  generateTechnicalPlanningCycleCommand.option("--plan-id <string>", "plan-id");
  generateTechnicalPlanningCycleCommand.option("--review-id <string>", "review-id");
  generateTechnicalPlanningCycleCommand.option("--prototype-paths <paths>", "comma-separated prototype paths");
  generateTechnicalPlanningCycleCommand.option("--boilerplate-paths <paths>", "comma-separated boilerplate paths");
  generateTechnicalPlanningCycleCommand.option("--success-criteria <items>", "comma-separated success criteria");
  generateTechnicalPlanningCycleCommand.option("--task-seeds-json <json>", "task seeds JSON array");
  generateTechnicalPlanningCycleCommand.action(async (options) => {
    try {
      const result = await planningClient().generateTechnicalPlanningCycle(compact({
        source: options.source ?? "freeform_docs",
        projectId: requiredOption(options, "projectId"),
        userPrompt: requiredOption(options, "userPrompt"),
        selectedDocIds: csvOption(options, "selectedDocIds"),
        traceId: options.traceId,
        maxDocChars: options.maxDocChars,
        planId: options.planId,
        reviewId: options.reviewId,
        prototypePaths: csvOption(options, "prototypePaths"),
        boilerplatePaths: csvOption(options, "boilerplatePaths"),
        successCriteria: csvOption(options, "successCriteria"),
        taskSeeds: jsonArrayOption(options, "taskSeedsJson"),
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const materializeApprovedPlanBreakdownCommand = command.command("materialize-approved-plan-breakdown");
  materializeApprovedPlanBreakdownCommand.description("planning materializeApprovedPlanBreakdown");
  materializeApprovedPlanBreakdownCommand.option("--json", "Emit JSON output");
  materializeApprovedPlanBreakdownCommand.option("--plan-id <string>", "plan-id");
  materializeApprovedPlanBreakdownCommand.option("--approved-plan-markdown <string>", "approved-plan-markdown");
  materializeApprovedPlanBreakdownCommand.option("--project-id <string>", "project-id");
  materializeApprovedPlanBreakdownCommand.option("--workspace-id <string>", "workspace-id");
  materializeApprovedPlanBreakdownCommand.option("--workspace-slug <string>", "workspace-slug");
  materializeApprovedPlanBreakdownCommand.option("--workspace-name <string>", "workspace-name");
  materializeApprovedPlanBreakdownCommand.option("--project-slug <string>", "project-slug");
  materializeApprovedPlanBreakdownCommand.option("--project-name <string>", "project-name");
  materializeApprovedPlanBreakdownCommand.option("--trace-id <string>", "trace-id");
  materializeApprovedPlanBreakdownCommand.option("--review-id <string>", "review-id");
  materializeApprovedPlanBreakdownCommand.option("--source-doc-ids <ids>", "comma-separated source doc ids");
  materializeApprovedPlanBreakdownCommand.action(async (options) => {
    try {
      const result = await planningClient().materializeApprovedPlanBreakdown(compact({
        ...workflowMetadata(options),
        planId: requiredOption(options, "planId"),
        approvedPlanMarkdown: requiredOption(options, "approvedPlanMarkdown"),
        traceId: options.traceId,
        reviewId: options.reviewId,
        sourceDocRefs: sourceDocRefs(options),
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const previewApprovedPlanBreakdownCommand = command.command("preview-approved-plan-breakdown");
  previewApprovedPlanBreakdownCommand.description("planning previewApprovedPlanBreakdown");
  previewApprovedPlanBreakdownCommand.option("--json", "Emit JSON output");
  previewApprovedPlanBreakdownCommand.option("--plan-id <string>", "plan-id");
  previewApprovedPlanBreakdownCommand.option("--approved-plan-markdown <string>", "approved-plan-markdown");
  previewApprovedPlanBreakdownCommand.option("--project-id <string>", "project-id");
  previewApprovedPlanBreakdownCommand.option("--trace-id <string>", "trace-id");
  previewApprovedPlanBreakdownCommand.option("--review-id <string>", "review-id");
  previewApprovedPlanBreakdownCommand.option("--source-doc-ids <ids>", "comma-separated source doc ids");
  previewApprovedPlanBreakdownCommand.action(async (options) => {
    try {
      const result = await planningClient().previewApprovedPlanBreakdown(compact({
        planId: requiredOption(options, "planId"),
        approvedPlanMarkdown: requiredOption(options, "approvedPlanMarkdown"),
        projectId: options.projectId,
        traceId: options.traceId,
        reviewId: options.reviewId,
        sourceDocRefs: sourceDocRefs(options),
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const restartPlanningCycleFromUpdatesCommand = command.command("restart-planning-cycle-from-updates");
  restartPlanningCycleFromUpdatesCommand.description("planning restartPlanningCycleFromUpdates");
  restartPlanningCycleFromUpdatesCommand.option("--json", "Emit JSON output");
  restartPlanningCycleFromUpdatesCommand.addOption(new Option("--trigger <choice>", "trigger").choices(["manual_doc_edit", "acp_session_update"]));
  restartPlanningCycleFromUpdatesCommand.option("--project-id <string>", "project-id");
  restartPlanningCycleFromUpdatesCommand.option("--workspace-id <string>", "workspace-id");
  restartPlanningCycleFromUpdatesCommand.option("--workspace-slug <string>", "workspace-slug");
  restartPlanningCycleFromUpdatesCommand.option("--workspace-name <string>", "workspace-name");
  restartPlanningCycleFromUpdatesCommand.option("--project-slug <string>", "project-slug");
  restartPlanningCycleFromUpdatesCommand.option("--project-name <string>", "project-name");
  restartPlanningCycleFromUpdatesCommand.option("--user-prompt <string>", "user-prompt");
  restartPlanningCycleFromUpdatesCommand.option("--trace-id <string>", "trace-id");
  restartPlanningCycleFromUpdatesCommand.option("--acp-session-id <string>", "acp-session-id");
  restartPlanningCycleFromUpdatesCommand.option("--mode-id <string>", "mode-id");
  restartPlanningCycleFromUpdatesCommand.option("--model-id <string>", "model-id");
  restartPlanningCycleFromUpdatesCommand.option("--selected-doc-ids <ids>", "comma-separated selected doc ids");
  restartPlanningCycleFromUpdatesCommand.option("--target-task-ids <ids>", "comma-separated target task ids");
  restartPlanningCycleFromUpdatesCommand.option("--changed-docs-json <json>", "changed docs JSON array");
  restartPlanningCycleFromUpdatesCommand.action(async (options) => {
    try {
      const result = await planningClient().restartPlanningCycleFromUpdates(compact({
        ...workflowMetadata(options),
        trigger: requiredOption(options, "trigger"),
        userPrompt: requiredOption(options, "userPrompt"),
        traceId: options.traceId,
        acpSessionId: options.acpSessionId,
        modeId: options.modeId,
        modelId: options.modelId,
        selectedDocIds: csvOption(options, "selectedDocIds"),
        targetTaskIds: csvOption(options, "targetTaskIds"),
        changedDocs: jsonArrayOption(options, "changedDocsJson"),
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const startFreeformWorkFromDocsCommand = command.command("start-freeform-work-from-docs");
  startFreeformWorkFromDocsCommand.description("planning startFreeformWorkFromDocs");
  startFreeformWorkFromDocsCommand.option("--json", "Emit JSON output");
  startFreeformWorkFromDocsCommand.option("--project-id <string>", "project-id");
  startFreeformWorkFromDocsCommand.option("--workspace-id <string>", "workspace-id");
  startFreeformWorkFromDocsCommand.option("--workspace-slug <string>", "workspace-slug");
  startFreeformWorkFromDocsCommand.option("--workspace-name <string>", "workspace-name");
  startFreeformWorkFromDocsCommand.option("--project-slug <string>", "project-slug");
  startFreeformWorkFromDocsCommand.option("--project-name <string>", "project-name");
  startFreeformWorkFromDocsCommand.option("--document-id <string>", "document-id");
  startFreeformWorkFromDocsCommand.option("--title <string>", "title");
  startFreeformWorkFromDocsCommand.option("--body-md <string>", "body-md");
  startFreeformWorkFromDocsCommand.option("--user-prompt <string>", "user-prompt");
  startFreeformWorkFromDocsCommand.option("--trace-id <string>", "trace-id");
  startFreeformWorkFromDocsCommand.option("--acp-session-id <string>", "acp-session-id");
  startFreeformWorkFromDocsCommand.option("--mode-id <string>", "mode-id");
  startFreeformWorkFromDocsCommand.option("--model-id <string>", "model-id");
  startFreeformWorkFromDocsCommand.option("--max-doc-chars <number>", "max-doc-chars", Number.parseFloat);
  startFreeformWorkFromDocsCommand.action(async (options) => {
    try {
      const result = await planningClient().startFreeformWorkFromDocs(compact({
        ...workflowMetadata(options),
        documentId: options.documentId,
        title: requiredOption(options, "title"),
        bodyMd: requiredOption(options, "bodyMd"),
        userPrompt: requiredOption(options, "userPrompt"),
        traceId: options.traceId,
        acpSessionId: options.acpSessionId,
        modeId: options.modeId,
        modelId: options.modelId,
        maxDocChars: options.maxDocChars,
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const startGuidedAcpPlanningSessionCommand = command.command("start-guided-acp-planning-session");
  startGuidedAcpPlanningSessionCommand.description("planning startGuidedAcpPlanningSession");
  startGuidedAcpPlanningSessionCommand.option("--json", "Emit JSON output");
  startGuidedAcpPlanningSessionCommand.option("--project-id <string>", "project-id");
  startGuidedAcpPlanningSessionCommand.option("--workspace-id <string>", "workspace-id");
  startGuidedAcpPlanningSessionCommand.option("--workspace-slug <string>", "workspace-slug");
  startGuidedAcpPlanningSessionCommand.option("--workspace-name <string>", "workspace-name");
  startGuidedAcpPlanningSessionCommand.option("--project-slug <string>", "project-slug");
  startGuidedAcpPlanningSessionCommand.option("--project-name <string>", "project-name");
  startGuidedAcpPlanningSessionCommand.option("--acp-session-id <string>", "acp-session-id");
  startGuidedAcpPlanningSessionCommand.option("--agent-name <string>", "agent-name");
  startGuidedAcpPlanningSessionCommand.option("--cwd <string>", "cwd");
  startGuidedAcpPlanningSessionCommand.option("--user-prompt <string>", "user-prompt");
  startGuidedAcpPlanningSessionCommand.option("--prompt-template-id <string>", "prompt-template-id");
  startGuidedAcpPlanningSessionCommand.option("--selected-doc-ids <ids>", "comma-separated selected doc ids");
  startGuidedAcpPlanningSessionCommand.option("--trace-id <string>", "trace-id");
  startGuidedAcpPlanningSessionCommand.option("--mode-id <string>", "mode-id");
  startGuidedAcpPlanningSessionCommand.option("--model-id <string>", "model-id");
  startGuidedAcpPlanningSessionCommand.addOption(new Option("--permission-mode <choice>", "permission-mode").choices(["review_each_tool", "allow_workspace", "read_only"]));
  startGuidedAcpPlanningSessionCommand.option("--max-doc-chars <number>", "max-doc-chars", Number.parseFloat);
  startGuidedAcpPlanningSessionCommand.action(async (options) => {
    try {
      const result = await planningClient().startGuidedAcpPlanningSession(compact({
        ...workflowMetadata(options),
        acpSessionId: requiredOption(options, "acpSessionId"),
        agentName: requiredOption(options, "agentName"),
        cwd: requiredOption(options, "cwd"),
        userPrompt: requiredOption(options, "userPrompt"),
        promptTemplateId: options.promptTemplateId,
        selectedDocIds: csvOption(options, "selectedDocIds"),
        traceId: options.traceId,
        modeId: options.modeId,
        modelId: options.modelId,
        permissionMode: options.permissionMode,
        maxDocChars: options.maxDocChars,
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const recordGuidedAcpSessionActionCommand = command.command("record-guided-acp-session-action");
  recordGuidedAcpSessionActionCommand.description("planning recordGuidedAcpSessionAction");
  recordGuidedAcpSessionActionCommand.option("--json", "Emit JSON output");
  recordGuidedAcpSessionActionCommand.option("--project-id <string>", "project-id");
  recordGuidedAcpSessionActionCommand.option("--acp-session-id <string>", "acp-session-id");
  recordGuidedAcpSessionActionCommand.addOption(new Option("--action <choice>", "action").choices(["resume_session", "cancel_operation", "resolve_permission", "cancel_permission", "set_mode", "set_model"]));
  recordGuidedAcpSessionActionCommand.option("--trace-id <string>", "trace-id");
  recordGuidedAcpSessionActionCommand.option("--option-id <string>", "permission option-id");
  recordGuidedAcpSessionActionCommand.option("--mode-id <string>", "mode-id");
  recordGuidedAcpSessionActionCommand.option("--model-id <string>", "model-id");
  recordGuidedAcpSessionActionCommand.action(async (options) => {
    try {
      const result = await planningClient().recordGuidedAcpSessionAction(compact({
        acpSessionId: requiredOption(options, "acpSessionId"),
        action: requiredOption(options, "action"),
        projectId: options.projectId,
        traceId: options.traceId,
        optionId: options.optionId,
        modeId: options.modeId,
        modelId: options.modelId,
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const runArtifactExecutionCommand = command.command("run-artifact-execution");
  runArtifactExecutionCommand.description("planning runArtifactExecution");
  runArtifactExecutionCommand.option("--json", "Emit JSON output");
  runArtifactExecutionCommand.option("--plan-id <string>", "plan-id");
  runArtifactExecutionCommand.option("--artifact-path <string>", "artifact-path");
  runArtifactExecutionCommand.option("--prototype-id <string>", "prototype-id");
  runArtifactExecutionCommand.option("--artifact-id <string>", "artifact-id");
  runArtifactExecutionCommand.option("--trace-id <string>", "trace-id");
  runArtifactExecutionCommand.option("--command <string>", "command");
  runArtifactExecutionCommand.option("--args-json <json>", "args JSON array");
  runArtifactExecutionCommand.option("--url-path <string>", "url-path");
  runArtifactExecutionCommand.option("--summary <string>", "summary");
  runArtifactExecutionCommand.option("--output-ref <string>", "output-ref");
  runArtifactExecutionCommand.option("--checks-json <json>", "checks JSON array");
  runArtifactExecutionCommand.option("--executed-at <string>", "executed-at");
  runArtifactExecutionCommand.option("--cwd <string>", "cwd");
  runArtifactExecutionCommand.option("--branch <string>", "branch");
  runArtifactExecutionCommand.option("--copy-to-worktree-json <json>", "copy-to-worktree JSON array");
  runArtifactExecutionCommand.option("--timeout-ms <number>", "timeout-ms", integerOption);
  runArtifactExecutionCommand.option("--plan-only", "Record readiness without running the artifact command");
  runArtifactExecutionCommand.action(async (options) => {
    try {
      const result = await planningClient().runArtifactExecution(compact({
        planId: requiredOption(options, "planId"),
        artifactPath: requiredOption(options, "artifactPath"),
        prototypeId: options.prototypeId,
        artifactId: options.artifactId,
        traceId: options.traceId,
        command: options.command,
        args: jsonStringArrayOption(options, "argsJson"),
        urlPath: options.urlPath,
        summary: options.summary,
        outputRef: options.outputRef,
        checks: jsonStringArrayOption(options, "checksJson"),
        executedAt: options.executedAt,
        cwd: options.cwd,
        branch: options.branch,
        copyToWorktree: jsonStringArrayOption(options, "copyToWorktreeJson"),
        timeoutMs: options.timeoutMs,
        planOnly: options.planOnly === true ? true : undefined,
      }));
      printGeneratedResult(result, options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}

function planningClient() {
  const caller = createWorkflowApiCallerFromEnv();
  if (!caller) {
    throw new Error("Workflow API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.planning;
}

function workflowMetadata(options: Record<string, unknown>): Record<string, unknown> {
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

function sourceDocRefs(options: Record<string, unknown>): Array<{ id: string }> | undefined {
  const ids = csvOption(options, "sourceDocIds");
  return ids.length ? ids.map((id) => ({ id })) : undefined;
}

function csvOption(options: Record<string, unknown>, key: string): string[] {
  const value = options[key];
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function jsonArrayOption(options: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a JSON array.`);
  return parsed;
}

function jsonStringArrayOption(options: Record<string, unknown>, key: string): string[] | undefined {
  const values = jsonArrayOption(options, key);
  if (!values) return undefined;
  if (values.some((value) => typeof value !== "string")) throw new Error(`${key} must be a JSON string array.`);
  return values as string[];
}

function integerOption(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${value} must be an integer.`);
  return parsed;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function stringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function slugOf(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "local";
}

function titleOf(value: string): string {
  return value.split(/[-_\s]+/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Local";
}
