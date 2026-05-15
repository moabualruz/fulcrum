import { Command, Option } from "commander";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";
import { createTaskApiCallerFromEnv } from "@work-management/interface/http/task-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createTasksCommand(): Command {
  const command = new Command("tasks");
  command.description("Generated tasks commands.");

  const bulkDeleteCommand = command.command("bulk-delete");
  bulkDeleteCommand.description("tasks bulkDelete");
  bulkDeleteCommand.option("--json", "Emit JSON output");
  bulkDeleteCommand.option("--ids <ids>", "comma-separated task ids");
  bulkDeleteCommand.option("--project-id <string>", "project-id");
  bulkDeleteCommand.action(async (options) => {
    try {
      const result = [];
      for (const id of requiredCsvOption(options, "ids")) {
        result.push(await taskClient().delete(compact({ id, projectId: options.projectId }) as JsonRecord & { id: string }));
      }
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

  const bulkUpdateCommand = command.command("bulk-update");
  bulkUpdateCommand.description("tasks bulkUpdate");
  bulkUpdateCommand.option("--json", "Emit JSON output");
  bulkUpdateCommand.option("--ids <ids>", "comma-separated task ids");
  bulkUpdateCommand.option("--project-id <string>", "project-id");
  bulkUpdateCommand.option("--title <string>", "title");
  bulkUpdateCommand.option("--status <string>", "status");
  bulkUpdateCommand.option("--priority <number>", "priority", Number.parseFloat);
  bulkUpdateCommand.action(async (options) => {
    try {
      const patch = taskPatchOptions(options);
      const result = [];
      for (const id of requiredCsvOption(options, "ids")) {
        result.push(await taskClient().update(compact({ id, projectId: options.projectId, ...patch }) as JsonRecord & { id: string }));
      }
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

  const createCommand = command.command("create");
  createCommand.description("tasks create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--title <string>", "title");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--assignee-id <string>", "assignee-id");
  createCommand.option("--description <string>", "description");
  createCommand.option("--description-text <string>", "description-text");
  createCommand.option("--points <number>", "points", Number.parseFloat);
  createCommand.option("--priority <number>", "priority", Number.parseFloat);
  createCommand.option("--status <string>", "status");
  createCommand.action(async (options) => {
    try {
      const result = await taskClient().create(compact({
        title: requiredOption(options, "title"),
        projectId: options.projectId,
        description: options.description,
        descriptionText: options.descriptionText,
        points: options.points,
        priority: options.priority,
        status: options.status,
        assigneeId: options.assigneeId,
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

  const deleteCommand = command.command("delete");
  deleteCommand.description("tasks delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "task id");
  deleteCommand.option("--project-id <string>", "project-id");
  deleteCommand.action(async (options) => {
    try {
      const result = await taskClient().delete(compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
      }) as JsonRecord & { id: string });
      printGeneratedResult(result ?? { ok: true }, options);
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

  const dependencyRunLiveFeedbackCommand = command.command("dependency-run-live-feedback");
  dependencyRunLiveFeedbackCommand.description("tasks dependencyRunLiveFeedback");
  dependencyRunLiveFeedbackCommand.option("--json", "Emit JSON output");
  dependencyRunLiveFeedbackCommand.option("--project-id <string>", "project-id");
  dependencyRunLiveFeedbackCommand.option("--run-group-id <string>", "run-group-id");
  dependencyRunLiveFeedbackCommand.option("--run-id <string>", "run-id");
  dependencyRunLiveFeedbackCommand.option("--task-id <string>", "task-id");
  dependencyRunLiveFeedbackCommand.option("--trace-id <string>", "trace-id");
  dependencyRunLiveFeedbackCommand.action(async (options) => {
    try {
      const result = await workflowTasks().dependencyRunLiveFeedback(compact({
        projectId: requiredOption(options, "projectId"),
        traceId: options.traceId,
        runGroupId: options.runGroupId,
        runId: options.runId,
        taskId: options.taskId,
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

  const dependencyRunLiveFeedbackStreamCommand = command.command("dependency-run-live-feedback-stream");
  dependencyRunLiveFeedbackStreamCommand.description("tasks dependencyRunLiveFeedbackStream");
  dependencyRunLiveFeedbackStreamCommand.option("--json", "Emit JSON output");
  dependencyRunLiveFeedbackStreamCommand.option("--watch", "Stream subscription events as JSON lines");
  dependencyRunLiveFeedbackStreamCommand.option("--project-id <string>", "project-id");
  dependencyRunLiveFeedbackStreamCommand.option("--run-group-id <string>", "run-group-id");
  dependencyRunLiveFeedbackStreamCommand.option("--run-id <string>", "run-id");
  dependencyRunLiveFeedbackStreamCommand.option("--task-id <string>", "task-id");
  dependencyRunLiveFeedbackStreamCommand.option("--trace-id <string>", "trace-id");
  dependencyRunLiveFeedbackStreamCommand.action(async (options) => {
    try {
      if (options.watch === true) {
        await runGeneratedSubscriptionWatch({ procedurePath: "tasks.dependencyRunLiveFeedbackStream" });
        return;
      }
      const result = await workflowTasks().dependencyRunLiveFeedback(compact({
        projectId: requiredOption(options, "projectId"),
        traceId: options.traceId,
        runGroupId: options.runGroupId,
        runId: options.runId,
        taskId: options.taskId,
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

  const dispatchDependencyRunCommand = command.command("dispatch-dependency-run");
  dispatchDependencyRunCommand.description("tasks dispatchDependencyRun");
  dispatchDependencyRunCommand.option("--json", "Emit JSON output");
  dispatchDependencyRunCommand.addOption(new Option("--mode <choice>", "mode").choices(["task","board"]).default("task"));
  dispatchDependencyRunCommand.option("--target-task-ids <ids>", "comma-separated target task ids");
  dispatchDependencyRunCommand.option("--project-id <string>", "project-id");
  dispatchDependencyRunCommand.option("--workspace-id <string>", "workspace-id");
  dispatchDependencyRunCommand.option("--workspace-slug <string>", "workspace-slug");
  dispatchDependencyRunCommand.option("--workspace-name <string>", "workspace-name");
  dispatchDependencyRunCommand.option("--project-slug <string>", "project-slug");
  dispatchDependencyRunCommand.option("--project-name <string>", "project-name");
  dispatchDependencyRunCommand.option("--trace-id <string>", "trace-id");
  dispatchDependencyRunCommand.option("--agent <string>", "agent");
  dispatchDependencyRunCommand.option("--model <string>", "model");
  dispatchDependencyRunCommand.option("--prompt <string>", "prompt");
  dispatchDependencyRunCommand.action(async (options) => {
    try {
      const result = await workflowTasks().dispatchDependencyRun(compact({
        ...workflowMetadata(options),
        mode: options.mode ?? "task",
        targetTaskIds: requiredCsvOption(options, "targetTaskIds"),
        traceId: options.traceId,
        agent: requiredOption(options, "agent"),
        model: options.model,
        prompt: options.prompt,
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

  const getCommand = command.command("get");
  getCommand.description("tasks get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "task id");
  getCommand.option("--project-id <string>", "project-id");
  getCommand.action(async (options) => {
    try {
      const result = await taskClient().get(compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
      }) as JsonRecord & { id: string });
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

  const listCommand = command.command("list");
  listCommand.description("tasks list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-deleted", "include-deleted");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    try {
      const result = await taskClient().list(compact({
        projectId: options.projectId,
        includeDeleted: options.includeDeleted,
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

  const listChildrenCommand = command.command("list-children");
  listChildrenCommand.description("tasks listChildren");
  listChildrenCommand.option("--json", "Emit JSON output");
  listChildrenCommand.option("--id <string>", "task id");
  listChildrenCommand.option("--project-id <string>", "project-id");
  listChildrenCommand.action(async (options) => {
    try {
      const result = await taskClient().listChildren(compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
      }) as JsonRecord & { id: string });
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

  const manualWorkbenchCommand = command.command("manual-workbench");
  manualWorkbenchCommand.description("tasks manualWorkbench");
  manualWorkbenchCommand.option("--json", "Emit JSON output");
  manualWorkbenchCommand.option("--project-capabilities-estimate-enabled", "project-capabilities-estimate-enabled");
  manualWorkbenchCommand.option("--project-id <string>", "project-id");
  manualWorkbenchCommand.option("--trace-id <string>", "trace-id");
  manualWorkbenchCommand.option("--statuses <ids>", "comma-separated statuses");
  manualWorkbenchCommand.option("--state-groups <ids>", "comma-separated state groups");
  manualWorkbenchCommand.option("--labels <ids>", "comma-separated labels");
  manualWorkbenchCommand.option("--assignee-ids <ids>", "comma-separated assignee ids");
  manualWorkbenchCommand.option("--cycle-ids <ids>", "comma-separated cycle ids");
  manualWorkbenchCommand.option("--module-ids <ids>", "comma-separated module ids");
  manualWorkbenchCommand.option("--task-types <ids>", "comma-separated task types");
  manualWorkbenchCommand.option("--priorities <ids>", "comma-separated priorities");
  manualWorkbenchCommand.option("--search <string>", "search");
  manualWorkbenchCommand.addOption(new Option("--view-mode <choice>", "view-mode").choices(["board","list","table"]));
  manualWorkbenchCommand.action(async (options) => {
    try {
      const result = await taskClient().manualWorkbench(compact({
        projectId: options.projectId,
        traceId: options.traceId,
        viewMode: options.viewMode,
        filters: compact({
          statuses: csvOption(options, "statuses"),
          stateGroups: csvOption(options, "stateGroups"),
          labels: csvOption(options, "labels"),
          assigneeIds: csvOption(options, "assigneeIds"),
          cycleIds: csvOption(options, "cycleIds"),
          moduleIds: csvOption(options, "moduleIds"),
          taskTypes: csvOption(options, "taskTypes"),
          priorities: numericCsvOption(options, "priorities"),
          search: options.search,
        }),
        projectCapabilities: {
          estimateEnabled: options.projectCapabilitiesEstimateEnabled === true,
        },
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

  const previewDependencyRunCommand = command.command("preview-dependency-run");
  previewDependencyRunCommand.description("tasks previewDependencyRun");
  previewDependencyRunCommand.option("--json", "Emit JSON output");
  previewDependencyRunCommand.addOption(new Option("--mode <choice>", "mode").choices(["task","board"]));
  previewDependencyRunCommand.option("--project-id <string>", "project-id");
  previewDependencyRunCommand.option("--target-task-ids <ids>", "comma-separated target task ids");
  previewDependencyRunCommand.option("--trace-id <string>", "trace-id");
  previewDependencyRunCommand.action(async (options) => {
    try {
      const result = await workflowTasks().previewDependencyRun(compact({
        projectId: requiredOption(options, "projectId"),
        mode: options.mode ?? "task",
        targetTaskIds: requiredCsvOption(options, "targetTaskIds"),
        traceId: options.traceId,
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

  const recordQaReviewCommand = command.command("record-qa-review");
  recordQaReviewCommand.description("tasks recordQaReview");
  recordQaReviewCommand.option("--json", "Emit JSON output");
  recordQaReviewCommand.option("--baseline <string>", "baseline");
  recordQaReviewCommand.option("--checkpoint-id <string>", "checkpoint-id");
  recordQaReviewCommand.option("--feedback-agent <string>", "feedback-agent");
  recordQaReviewCommand.option("--feedback-model <string>", "feedback-model");
  recordQaReviewCommand.option("--project-id <string>", "project-id");
  recordQaReviewCommand.option("--workspace-id <string>", "workspace-id");
  recordQaReviewCommand.option("--workspace-slug <string>", "workspace-slug");
  recordQaReviewCommand.option("--workspace-name <string>", "workspace-name");
  recordQaReviewCommand.option("--project-slug <string>", "project-slug");
  recordQaReviewCommand.option("--project-name <string>", "project-name");
  recordQaReviewCommand.option("--task-id <string>", "task-id");
  recordQaReviewCommand.option("--review-text <string>", "review-text");
  recordQaReviewCommand.addOption(new Option("--review-type <choice>", "review-type").choices(["plan","code","spec"]));
  recordQaReviewCommand.option("--reviewer-agent <string>", "reviewer-agent");
  recordQaReviewCommand.option("--run-id <string>", "run-id");
  recordQaReviewCommand.option("--summary <string>", "summary");
  recordQaReviewCommand.option("--trace-id <string>", "trace-id");
  recordQaReviewCommand.action(async (options) => {
    try {
      const result = await workflowTasks().recordQaReview(compact({
        ...workflowMetadata(options),
        taskId: requiredOption(options, "taskId"),
        runId: options.runId,
        traceId: options.traceId,
        reviewType: options.reviewType ?? "code",
        reviewerAgent: options.reviewerAgent,
        reviewText: requiredOption(options, "reviewText"),
        feedbackAgent: options.feedbackAgent,
        feedbackModel: options.feedbackModel,
        baseline: options.baseline,
        checkpointId: options.checkpointId,
        summary: options.summary,
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

  const runAutomatedFeedbackLoopCommand = command.command("run-automated-feedback-loop");
  runAutomatedFeedbackLoopCommand.description("tasks runAutomatedFeedbackLoop");
  runAutomatedFeedbackLoopCommand.option("--json", "Emit JSON output");
  runAutomatedFeedbackLoopCommand.option("--cwd <string>", "cwd");
  runAutomatedFeedbackLoopCommand.option("--copy-to-worktree <paths>", "comma-separated paths to copy to worktree");
  runAutomatedFeedbackLoopCommand.option("--feedback-agent <string>", "feedback-agent");
  runAutomatedFeedbackLoopCommand.option("--feedback-model <string>", "feedback-model");
  runAutomatedFeedbackLoopCommand.option("--max-iterations <number>", "max-iterations", Number.parseFloat);
  runAutomatedFeedbackLoopCommand.option("--project-id <string>", "project-id");
  runAutomatedFeedbackLoopCommand.addOption(new Option("--review-type <choice>", "review-type").choices(["plan","code","spec"]));
  runAutomatedFeedbackLoopCommand.option("--reviewer-agent <string>", "reviewer-agent");
  runAutomatedFeedbackLoopCommand.option("--run-group-id <string>", "run-group-id");
  runAutomatedFeedbackLoopCommand.option("--trace-id <string>", "trace-id");
  runAutomatedFeedbackLoopCommand.option("--worker-id <string>", "worker-id");
  runAutomatedFeedbackLoopCommand.action(async (options) => {
    try {
      const result = await workflowTasks().runAutomatedFeedbackLoop(compact({
        ...workflowMetadata(options),
        traceId: options.traceId,
        runGroupId: options.runGroupId,
        workerId: options.workerId,
        cwd: options.cwd,
        copyToWorktree: csvOption(options, "copyToWorktree"),
        reviewType: options.reviewType ?? "code",
        reviewerAgent: options.reviewerAgent,
        feedbackAgent: options.feedbackAgent,
        feedbackModel: options.feedbackModel,
        maxIterations: options.maxIterations,
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

  const runDependencyRunWorkerTickCommand = command.command("run-dependency-run-worker-tick");
  runDependencyRunWorkerTickCommand.description("tasks runDependencyRunWorkerTick");
  runDependencyRunWorkerTickCommand.option("--json", "Emit JSON output");
  runDependencyRunWorkerTickCommand.option("--cwd <string>", "cwd");
  runDependencyRunWorkerTickCommand.option("--project-id <string>", "project-id");
  runDependencyRunWorkerTickCommand.option("--run-group-id <string>", "run-group-id");
  runDependencyRunWorkerTickCommand.option("--trace-id <string>", "trace-id");
  runDependencyRunWorkerTickCommand.option("--worker-id <string>", "worker-id");
  runDependencyRunWorkerTickCommand.action(async (options) => {
    try {
      const result = await workflowTasks().runDependencyRunWorkerTick(compact({
        projectId: requiredOption(options, "projectId"),
        traceId: options.traceId,
        runGroupId: options.runGroupId,
        workerId: options.workerId,
        cwd: options.cwd,
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

  const setDependenciesCommand = command.command("set-dependencies");
  setDependenciesCommand.description("tasks setDependencies");
  setDependenciesCommand.option("--json", "Emit JSON output");
  setDependenciesCommand.option("--id <string>", "task id");
  setDependenciesCommand.option("--project-id <string>", "project-id");
  setDependenciesCommand.option("--blocks <ids>", "comma-separated blocked task ids");
  setDependenciesCommand.option("--blocked-by <ids>", "comma-separated dependency task ids");
  setDependenciesCommand.action(async (options) => {
    try {
      const result = await taskClient().setDependencies(compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
        blocks: csvOption(options, "blocks"),
        blocked_by: csvOption(options, "blockedBy"),
      }) as JsonRecord & { id: string });
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

  const setParentCommand = command.command("set-parent");
  setParentCommand.description("tasks setParent");
  setParentCommand.option("--json", "Emit JSON output");
  setParentCommand.option("--id <string>", "task id");
  setParentCommand.option("--parent-id <string>", "parent task id");
  setParentCommand.option("--project-id <string>", "project-id");
  setParentCommand.option("--clear-parent", "clear parent task");
  setParentCommand.action(async (options) => {
    try {
      const input = compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
      }) as JsonRecord & { id: string };
      input.parentId = options.clearParent === true ? null : requiredOption(options, "parentId");
      const result = await taskClient().setParent(input);
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

  const updateCommand = command.command("update");
  updateCommand.description("tasks update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "task id");
  updateCommand.option("--project-id <string>", "project-id");
  updateCommand.option("--title <string>", "title");
  updateCommand.option("--description <string>", "description");
  updateCommand.option("--description-text <string>", "description-text");
  updateCommand.option("--points <number>", "points", Number.parseFloat);
  updateCommand.option("--priority <number>", "priority", Number.parseFloat);
  updateCommand.option("--status <string>", "status");
  updateCommand.option("--assignee-id <string>", "assignee-id");
  updateCommand.action(async (options) => {
    try {
      const result = await taskClient().update(compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
        ...taskPatchOptions(options),
      }) as JsonRecord & { id: string });
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

function taskClient() {
  const caller = createTaskApiCallerFromEnv();
  if (!caller) {
    throw new Error("Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL with FULCRUM_ORG_ID and FULCRUM_USER_ID.");
  }
  return caller.tasks;
}

function workflowTasks() {
  const caller = createWorkflowApiCallerFromEnv();
  if (!caller) {
    throw new Error("Workflow API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.tasks;
}

function taskPatchOptions(options: Record<string, unknown>): JsonRecord {
  return compact({
    title: options.title,
    description: options.description,
    descriptionText: options.descriptionText,
    points: options.points,
    priority: options.priority,
    status: options.status,
    assigneeId: options.assigneeId,
  });
}

function workflowMetadata(options: Record<string, unknown>): JsonRecord {
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

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = stringOption(options, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requiredCsvOption(options: Record<string, unknown>, key: string): string[] {
  const values = csvOption(options, key);
  if (values.length === 0) throw new Error(`${key} is required.`);
  return values;
}

function stringOption(options: Record<string, unknown>, key: string): string | null {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function csvOption(options: Record<string, unknown>, key: string): string[] {
  return (stringOption(options, key) ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

function numericCsvOption(options: Record<string, unknown>, key: string): number[] {
  return csvOption(options, key).map((part) => Number.parseInt(part, 10)).filter(Number.isInteger);
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

function printGeneratedResult(result: unknown, options: Record<string, unknown>): void {
  console.log(JSON.stringify(result, null, options.json === true ? 0 : 2));
}

function slugOf(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

function titleOf(value: string): string {
  return value.trim() || "Workspace";
}

async function runGeneratedSubscriptionWatch(options: { procedurePath: string }): Promise<void> {
  const shutdown = new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
  });
  await Promise.race([
    shutdown,
    Promise.reject(new Error(`Generated tRPC subscription for ${options.procedurePath} requires an explicit surface adapter.`)),
  ]);
}
