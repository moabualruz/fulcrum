import { Command, Option } from "commander";

export function createConnectorsCommand(): Command {
  const command = new Command("connectors");
  command.description("Generated connectors commands.");

  const deleteCommand = command.command("delete");
  deleteCommand.description("connectors delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.delete requires an explicit surface adapter.");
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

  const disableCommand = command.command("disable");
  disableCommand.description("connectors disable");
  disableCommand.option("--json", "Emit JSON output");
  disableCommand.option("--id <string>", "id");
  disableCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.disable requires an explicit surface adapter.");
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

  const enableCommand = command.command("enable");
  enableCommand.description("connectors enable");
  enableCommand.option("--json", "Emit JSON output");
  enableCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.enable requires an explicit surface adapter.");
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
  getCommand.description("connectors get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.get requires an explicit surface adapter.");
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
  listCommand.description("connectors list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.list requires an explicit surface adapter.");
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

  const runsGetCommand = command.command("runs get");
  runsGetCommand.description("connectors runs get");
  runsGetCommand.option("--json", "Emit JSON output");
  runsGetCommand.option("--id <string>", "id");
  runsGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.runs.get requires an explicit surface adapter.");
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

  const runsListCommand = command.command("runs list");
  runsListCommand.description("connectors runs list");
  runsListCommand.option("--json", "Emit JSON output");
  runsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.runs.list requires an explicit surface adapter.");
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

  const syncCommand = command.command("sync");
  syncCommand.description("connectors sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for connectors.sync requires an explicit surface adapter.");
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
