import { Command, Option } from "commander";

export function createConnectorsCommand(): Command {
  const command = new Command("connectors");
  command.description("Generated connectors commands.");

  const disableCommand = command.command("disable");
  disableCommand.description("connectors disable");
  disableCommand.option("--json", "Emit JSON output");
  disableCommand.option("--id <string>", "id");
  disableCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.disable is not wired yet.");
  });

  const enableCommand = command.command("enable");
  enableCommand.description("connectors enable");
  enableCommand.option("--json", "Emit JSON output");
  enableCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.enable is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("connectors get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("connectors list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.list is not wired yet.");
  });

  const runsGetCommand = command.command("runs get");
  runsGetCommand.description("connectors runs get");
  runsGetCommand.option("--json", "Emit JSON output");
  runsGetCommand.option("--id <string>", "id");
  runsGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.runs.get is not wired yet.");
  });

  const runsListCommand = command.command("runs list");
  runsListCommand.description("connectors runs list");
  runsListCommand.option("--json", "Emit JSON output");
  runsListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.runs.list is not wired yet.");
  });

  const syncCommand = command.command("sync");
  syncCommand.description("connectors sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.action(async () => {
    throw new Error("Generated tRPC invocation for connectors.sync is not wired yet.");
  });

  return command;
}
