import { Command, Option } from "commander";

export function createSprintsCommand(): Command {
  const command = new Command("sprints");
  command.description("Generated sprints commands.");

  const addTaskCommand = command.command("add-task");
  addTaskCommand.description("sprints addTask");
  addTaskCommand.option("--json", "Emit JSON output");
  addTaskCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.addTask is not wired yet.");
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

  const closeCommand = command.command("close");
  closeCommand.description("sprints close");
  closeCommand.option("--json", "Emit JSON output");
  closeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.close is not wired yet.");
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
  createCommand.description("sprints create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.create is not wired yet.");
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
  deleteCommand.description("sprints delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.delete is not wired yet.");
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
  getCommand.description("sprints get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.get is not wired yet.");
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
  listCommand.description("sprints list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.addOption(new Option("--status <choice>", "status").choices(["planned","active","completed"]));
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.list is not wired yet.");
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

  const removeTaskCommand = command.command("remove-task");
  removeTaskCommand.description("sprints removeTask");
  removeTaskCommand.option("--json", "Emit JSON output");
  removeTaskCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.removeTask is not wired yet.");
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

  const startCommand = command.command("start");
  startCommand.description("sprints start");
  startCommand.option("--json", "Emit JSON output");
  startCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.start is not wired yet.");
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
  updateCommand.description("sprints update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for sprints.update is not wired yet.");
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
