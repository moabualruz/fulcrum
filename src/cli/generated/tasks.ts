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
