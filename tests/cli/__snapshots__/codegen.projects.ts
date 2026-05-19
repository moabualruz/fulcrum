import { Command, Option } from "commander";

export function createProjectsCommand(): Command {
  const command = new Command("projects");
  command.description("Generated projects commands.");

  const createCommand = command.command("create");
  createCommand.description("projects create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.addOption(new Option("--kind <choice>", "kind").choices(["workspace","project","subproject"]));
  createCommand.option("--name <string>", "name");
  createCommand.option("--repo-path <string>", "repo-path");
  createCommand.option("--slug <string>", "slug");
  createCommand.option("--template <string>", "template");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.create requires an explicit surface adapter.");
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
  deleteCommand.description("projects delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.delete requires an explicit surface adapter.");
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
  getCommand.description("projects get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.get requires an explicit surface adapter.");
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
  listCommand.description("projects list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.list requires an explicit surface adapter.");
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

  const statsCommand = command.command("stats");
  statsCommand.description("projects stats");
  statsCommand.option("--json", "Emit JSON output");
  statsCommand.option("--id <string>", "id");
  statsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.stats requires an explicit surface adapter.");
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
  updateCommand.description("projects update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.update requires an explicit surface adapter.");
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

  const updateToolPermissionModeCommand = command.command("update-tool-permission-mode");
  updateToolPermissionModeCommand.description("projects updateToolPermissionMode");
  updateToolPermissionModeCommand.option("--json", "Emit JSON output");
  updateToolPermissionModeCommand.option("--id <string>", "id");
  updateToolPermissionModeCommand.addOption(new Option("--permission-mode <choice>", "permission-mode").choices(["review_each_tool","auto","danger"]));
  updateToolPermissionModeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for projects.updateToolPermissionMode requires an explicit surface adapter.");
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
