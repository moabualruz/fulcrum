import { Command } from "commander";

export function createSprintsCommand(): Command {
  const command = new Command("sprints");
  command.description("Sprint management commands.");

  const listCommand = command.command("list");
  listCommand.description("List sprints");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project <string>", "Project ID");
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

  const getCommand = command.command("get");
  getCommand.description("Get a sprint by ID or active sprint");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "Sprint ID");
  getCommand.option("--active", "Get the currently active sprint");
  getCommand.option("--project <string>", "Project ID to scope the query");
  getCommand.action(async (options) => {
    try {
      if (options.active) {
        throw new Error("Generated tRPC invocation for sprints.getActive is not wired yet.");
      }
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

  const createCommand = command.command("create");
  createCommand.description("Create a sprint");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--project <string>", "Project ID");
  createCommand.option("--name <string>", "Sprint name");
  createCommand.option("--start-date <string>", "Start date (YYYY-MM-DD)");
  createCommand.option("--end-date <string>", "End date (YYYY-MM-DD)");
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

  const startCommand = command.command("start");
  startCommand.description("Start a planned sprint");
  startCommand.option("--json", "Emit JSON output");
  startCommand.option("--id <string>", "Sprint ID");
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

  const closeCommand = command.command("close");
  closeCommand.description("Close an active sprint");
  closeCommand.option("--json", "Emit JSON output");
  closeCommand.option("--id <string>", "Sprint ID");
  closeCommand.option("--unfinished-to-backlog", "Move unfinished tasks to backlog (non-interactive)");
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

  return command;
}
