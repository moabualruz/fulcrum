import { Command, Option } from "commander";

export function createAgentRunsCommand(): Command {
  const command = new Command("agent_runs");
  command.description("Generated agent_runs commands.");

  const cancelCommand = command.command("cancel");
  cancelCommand.description("agent_runs cancel");
  cancelCommand.option("--json", "Emit JSON output");
  cancelCommand.option("--id <string>", "id");
  cancelCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agent_runs.cancel requires an explicit surface adapter.");
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
  createCommand.description("agent_runs create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agent_runs.create requires an explicit surface adapter.");
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
  getCommand.description("agent_runs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agent_runs.get requires an explicit surface adapter.");
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
  listCommand.description("agent_runs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agent_runs.list requires an explicit surface adapter.");
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

  const retryCommand = command.command("retry");
  retryCommand.description("agent_runs retry");
  retryCommand.option("--json", "Emit JSON output");
  retryCommand.option("--id <string>", "id");
  retryCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agent_runs.retry requires an explicit surface adapter.");
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
