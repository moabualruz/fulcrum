import { Command, Option } from "commander";

export function createTemplatesCommand(): Command {
  const command = new Command("templates");
  command.description("Generated templates commands.");

  const applyTemplateCommand = command.command("apply-template");
  applyTemplateCommand.description("templates applyTemplate");
  applyTemplateCommand.option("--json", "Emit JSON output");
  applyTemplateCommand.option("--template-id <string>", "template-id");
  applyTemplateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for templates.applyTemplate requires an explicit surface adapter.");
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
  createCommand.description("templates create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--description <string>", "description");
  createCommand.option("--name <string>", "name");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for templates.create requires an explicit surface adapter.");
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
  deleteCommand.description("templates delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--template-id <string>", "template-id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for templates.delete requires an explicit surface adapter.");
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
  listCommand.description("templates list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for templates.list requires an explicit surface adapter.");
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

  const setDefaultCommand = command.command("set-default");
  setDefaultCommand.description("templates setDefault");
  setDefaultCommand.option("--json", "Emit JSON output");
  setDefaultCommand.option("--project-id <string>", "project-id");
  setDefaultCommand.option("--template-id <string>", "template-id");
  setDefaultCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for templates.setDefault requires an explicit surface adapter.");
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
