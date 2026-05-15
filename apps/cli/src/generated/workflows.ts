import { Command, Option } from "commander";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";

export function createWorkflowsCommand(): Command {
  const command = new Command("workflows");
  command.description("Generated workflows commands.");

  const getDefaultCommand = command.command("get-default");
  getDefaultCommand.description("workflows getDefault");
  getDefaultCommand.option("--json", "Emit JSON output");
  getDefaultCommand.addOption(new Option("--methodology <choice>", "methodology").choices(["scrum","kanban","none"]));
  getDefaultCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().getDefaultWorkflow({ methodology: requiredOption(options, "methodology") })
    );
  });

  const getEnabledTaskTypesCommand = command.command("get-enabled-task-types");
  getEnabledTaskTypesCommand.description("workflows getEnabledTaskTypes");
  getEnabledTaskTypesCommand.option("--json", "Emit JSON output");
  getEnabledTaskTypesCommand.option("--project-id <string>", "project-id");
  getEnabledTaskTypesCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().getEnabledTaskTypes({ projectId: requiredOption(options, "projectId") })
    );
  });

  const getMethodologyCommand = command.command("get-methodology");
  getMethodologyCommand.description("workflows getMethodology");
  getMethodologyCommand.option("--json", "Emit JSON output");
  getMethodologyCommand.option("--project-id <string>", "project-id");
  getMethodologyCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().getMethodology({ projectId: requiredOption(options, "projectId") })
    );
  });

  const getTransitionsCommand = command.command("get-transitions");
  getTransitionsCommand.description("workflows getTransitions");
  getTransitionsCommand.option("--json", "Emit JSON output");
  getTransitionsCommand.option("--project-id <string>", "project-id");
  getTransitionsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().getTransitions({ projectId: requiredOption(options, "projectId") })
    );
  });

  const runAcceptanceCycleCommand = command.command("run-acceptance-cycle");
  runAcceptanceCycleCommand.description("workflows runAcceptanceCycle");
  runAcceptanceCycleCommand.option("--json", "Emit JSON output");
  runAcceptanceCycleCommand.option("--workspace-json <json>", "workspace JSON object");
  runAcceptanceCycleCommand.option("--project-json <json>", "project JSON object");
  runAcceptanceCycleCommand.option("--freeform-json <json>", "freeform JSON object");
  runAcceptanceCycleCommand.option("--guided-planning-json <json>", "guided planning JSON object");
  runAcceptanceCycleCommand.option("--approved-plan-json <json>", "approved plan JSON object");
  runAcceptanceCycleCommand.option("--execution-json <json>", "execution JSON object");
  runAcceptanceCycleCommand.option("--uat-json <json>", "UAT JSON object");
  runAcceptanceCycleCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().runAcceptanceCycle({
        workspace: jsonObjectOption(options, "workspaceJson"),
        project: jsonObjectOption(options, "projectJson"),
        freeform: jsonObjectOption(options, "freeformJson"),
        guidedPlanning: jsonObjectOption(options, "guidedPlanningJson"),
        approvedPlan: jsonObjectOption(options, "approvedPlanJson"),
        execution: jsonObjectOption(options, "executionJson"),
        uat: jsonObjectOption(options, "uatJson"),
      })
    );
  });

  const updateEnabledTaskTypesCommand = command.command("update-enabled-task-types");
  updateEnabledTaskTypesCommand.description("workflows updateEnabledTaskTypes");
  updateEnabledTaskTypesCommand.option("--json", "Emit JSON output");
  updateEnabledTaskTypesCommand.option("--project-id <string>", "project-id");
  updateEnabledTaskTypesCommand.option("--types <csv>", "Comma-separated enabled task types.");
  updateEnabledTaskTypesCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().updateEnabledTaskTypes({
        projectId: requiredOption(options, "projectId"),
        types: csvOption(options, "types"),
      })
    );
  });

  const updateMethodologyCommand = command.command("update-methodology");
  updateMethodologyCommand.description("workflows updateMethodology");
  updateMethodologyCommand.option("--json", "Emit JSON output");
  updateMethodologyCommand.addOption(new Option("--methodology <choice>", "methodology").choices(["scrum","kanban","none"]));
  updateMethodologyCommand.option("--project-id <string>", "project-id");
  updateMethodologyCommand.option("--reset-workflow", "reset-workflow");
  updateMethodologyCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().updateMethodology({
        projectId: requiredOption(options, "projectId"),
        methodology: requiredOption(options, "methodology"),
        resetWorkflow: options.resetWorkflow === true,
      })
    );
  });

  const updateTransitionsCommand = command.command("update-transitions");
  updateTransitionsCommand.description("workflows updateTransitions");
  updateTransitionsCommand.option("--json", "Emit JSON output");
  updateTransitionsCommand.option("--project-id <string>", "project-id");
  updateTransitionsCommand.option("--transitions-json <json>", "Transition graph JSON object.");
  updateTransitionsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().updateTransitions({
        projectId: requiredOption(options, "projectId"),
        transitions: jsonObjectOption(options, "transitionsJson"),
      })
    );
  });

  const validateTransitionCommand = command.command("validate-transition");
  validateTransitionCommand.description("workflows validateTransition");
  validateTransitionCommand.option("--json", "Emit JSON output");
  validateTransitionCommand.option("--from-status <string>", "from-status");
  validateTransitionCommand.option("--project-id <string>", "project-id");
  validateTransitionCommand.option("--to-status <string>", "to-status");
  validateTransitionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await workflowClient().validateTransition({
        projectId: requiredOption(options, "projectId"),
        fromStatus: requiredOption(options, "fromStatus"),
        toStatus: requiredOption(options, "toStatus"),
      })
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

function workflowClient() {
  const caller = createWorkflowApiCallerFromEnv();
  if (!caller) {
    throw new Error("Workflow API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.workflows;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function jsonObjectOption(options: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function csvOption(options: Record<string, unknown>, key: string): string[] {
  return requiredOption(options, key)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
