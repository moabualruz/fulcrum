import { Command, Option } from "commander";

export function createAgentRunsCommand(): Command {
  const command = new Command("agent_runs");
  command.description("Generated agent_runs commands.");

  const cancelCommand = command.command("cancel");
  cancelCommand.description("agent_runs cancel");
  cancelCommand.option("--json", "Emit JSON output");
  cancelCommand.option("--id <string>", "id");
  cancelCommand.action(async () => {
    throw new Error("Generated tRPC invocation for agent_runs.cancel is not wired yet.");
  });

  const createCommand = command.command("create");
  createCommand.description("agent_runs create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for agent_runs.create is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("agent_runs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for agent_runs.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("agent_runs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for agent_runs.list is not wired yet.");
  });

  const retryCommand = command.command("retry");
  retryCommand.description("agent_runs retry");
  retryCommand.option("--json", "Emit JSON output");
  retryCommand.option("--id <string>", "id");
  retryCommand.action(async () => {
    throw new Error("Generated tRPC invocation for agent_runs.retry is not wired yet.");
  });

  return command;
}
