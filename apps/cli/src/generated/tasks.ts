import { Command, Option } from "commander";

export function createTasksCommand(): Command {
  const command = new Command("tasks");
  command.description("Generated tasks commands.");

  const bulkDeleteCommand = command.command("bulk-delete");
  bulkDeleteCommand.description("tasks bulkDelete");
  bulkDeleteCommand.option("--json", "Emit JSON output");
  bulkDeleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.bulkDelete requires an explicit surface adapter.");
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
  bulkUpdateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.bulkUpdate requires an explicit surface adapter.");
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
  createCommand.option("--assignee-id <string>", "assignee-id");
  createCommand.option("--description <string>", "description");
  createCommand.option("--description-text <string>", "description-text");
  createCommand.option("--points <number>", "points", Number.parseFloat);
  createCommand.option("--priority <number>", "priority", Number.parseFloat);
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.create requires an explicit surface adapter.");
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
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.delete requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for tasks.dependencyRunLiveFeedback requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for tasks.dependencyRunLiveFeedbackStream requires an explicit surface adapter.");
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
  dispatchDependencyRunCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.dispatchDependencyRun requires an explicit surface adapter.");
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
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.get requires an explicit surface adapter.");
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
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.list requires an explicit surface adapter.");
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
  listChildrenCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.listChildren requires an explicit surface adapter.");
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
  manualWorkbenchCommand.addOption(new Option("--view-mode <choice>", "view-mode").choices(["board","list","table"]));
  manualWorkbenchCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.manualWorkbench requires an explicit surface adapter.");
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
  previewDependencyRunCommand.option("--trace-id <string>", "trace-id");
  previewDependencyRunCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.previewDependencyRun requires an explicit surface adapter.");
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
  recordQaReviewCommand.addOption(new Option("--review-type <choice>", "review-type").choices(["plan","code","spec"]));
  recordQaReviewCommand.option("--reviewer-agent <string>", "reviewer-agent");
  recordQaReviewCommand.option("--run-id <string>", "run-id");
  recordQaReviewCommand.option("--summary <string>", "summary");
  recordQaReviewCommand.option("--trace-id <string>", "trace-id");
  recordQaReviewCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.recordQaReview requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for tasks.runAutomatedFeedbackLoop requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for tasks.runDependencyRunWorkerTick requires an explicit surface adapter.");
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
  setDependenciesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.setDependencies requires an explicit surface adapter.");
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
  setParentCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.setParent requires an explicit surface adapter.");
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
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for tasks.update requires an explicit surface adapter.");
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

async function runGeneratedSubscriptionWatch(options: { procedurePath: string }): Promise<void> {
  const shutdown = new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
  });
  await Promise.race([
    shutdown,
    Promise.reject(new Error(`Generated tRPC subscription for ${options.procedurePath} requires an explicit surface adapter.`)),
  ]);
}
