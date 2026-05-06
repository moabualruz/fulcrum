import { Command, Option } from "commander";

export function createAutomationsCommand(): Command {
  const command = new Command("automations");
  command.description("Generated automations commands.");

  const createCommand = command.command("create");
  createCommand.description("automations create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--action-type <string>", "action-type");
  createCommand.option("--condition-field <string>", "condition-field");
  createCommand.addOption(new Option("--condition-operator <choice>", "condition-operator").choices(["equals","not_equals","contains","is_empty","is_not_empty"]));
  createCommand.option("--name <string>", "name");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--trigger-type <string>", "trigger-type");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for automations.create requires an explicit surface adapter.");
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
  deleteCommand.description("automations delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for automations.delete requires an explicit surface adapter.");
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
  listCommand.description("automations list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for automations.list requires an explicit surface adapter.");
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

  const templatesCommand = command.command("templates");
  templatesCommand.description("automations templates");
  templatesCommand.option("--json", "Emit JSON output");
  templatesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for automations.templates requires an explicit surface adapter.");
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
  updateCommand.description("automations update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--action-type <string>", "action-type");
  updateCommand.option("--condition-field <string>", "condition-field");
  updateCommand.addOption(new Option("--condition-operator <choice>", "condition-operator").choices(["equals","not_equals","contains","is_empty","is_not_empty"]));
  updateCommand.option("--enabled", "enabled");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.option("--trigger-type <string>", "trigger-type");
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for automations.update requires an explicit surface adapter.");
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
