import { Command, Option } from "commander";

export function createWorkflowsCommand(): Command {
  const command = new Command("workflows");
  command.description("Generated workflows commands.");

  const getDefaultCommand = command.command("get-default");
  getDefaultCommand.description("workflows getDefault");
  getDefaultCommand.option("--json", "Emit JSON output");
  getDefaultCommand.addOption(new Option("--methodology <choice>", "methodology").choices(["scrum","kanban","none"]));
  getDefaultCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.getDefault requires an explicit surface adapter.");
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

  const getEnabledTaskTypesCommand = command.command("get-enabled-task-types");
  getEnabledTaskTypesCommand.description("workflows getEnabledTaskTypes");
  getEnabledTaskTypesCommand.option("--json", "Emit JSON output");
  getEnabledTaskTypesCommand.option("--project-id <string>", "project-id");
  getEnabledTaskTypesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.getEnabledTaskTypes requires an explicit surface adapter.");
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

  const getMethodologyCommand = command.command("get-methodology");
  getMethodologyCommand.description("workflows getMethodology");
  getMethodologyCommand.option("--json", "Emit JSON output");
  getMethodologyCommand.option("--project-id <string>", "project-id");
  getMethodologyCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.getMethodology requires an explicit surface adapter.");
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

  const getTransitionsCommand = command.command("get-transitions");
  getTransitionsCommand.description("workflows getTransitions");
  getTransitionsCommand.option("--json", "Emit JSON output");
  getTransitionsCommand.option("--project-id <string>", "project-id");
  getTransitionsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.getTransitions requires an explicit surface adapter.");
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

  const updateEnabledTaskTypesCommand = command.command("update-enabled-task-types");
  updateEnabledTaskTypesCommand.description("workflows updateEnabledTaskTypes");
  updateEnabledTaskTypesCommand.option("--json", "Emit JSON output");
  updateEnabledTaskTypesCommand.option("--project-id <string>", "project-id");
  updateEnabledTaskTypesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.updateEnabledTaskTypes requires an explicit surface adapter.");
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

  const updateMethodologyCommand = command.command("update-methodology");
  updateMethodologyCommand.description("workflows updateMethodology");
  updateMethodologyCommand.option("--json", "Emit JSON output");
  updateMethodologyCommand.addOption(new Option("--methodology <choice>", "methodology").choices(["scrum","kanban","none"]));
  updateMethodologyCommand.option("--project-id <string>", "project-id");
  updateMethodologyCommand.option("--reset-workflow", "reset-workflow");
  updateMethodologyCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.updateMethodology requires an explicit surface adapter.");
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

  const updateTransitionsCommand = command.command("update-transitions");
  updateTransitionsCommand.description("workflows updateTransitions");
  updateTransitionsCommand.option("--json", "Emit JSON output");
  updateTransitionsCommand.option("--project-id <string>", "project-id");
  updateTransitionsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.updateTransitions requires an explicit surface adapter.");
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

  const validateTransitionCommand = command.command("validate-transition");
  validateTransitionCommand.description("workflows validateTransition");
  validateTransitionCommand.option("--json", "Emit JSON output");
  validateTransitionCommand.option("--from-status <string>", "from-status");
  validateTransitionCommand.option("--project-id <string>", "project-id");
  validateTransitionCommand.option("--to-status <string>", "to-status");
  validateTransitionCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for workflows.validateTransition requires an explicit surface adapter.");
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
