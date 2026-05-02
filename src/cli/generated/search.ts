import { Command, Option } from "commander";

export function createSearchCommand(): Command {
  const command = new Command("search");
  command.description("Generated search commands.");

  const queryCommand = command.command("query");
  queryCommand.description("search query");
  queryCommand.option("--json", "Emit JSON output");
  queryCommand.option("--q <string>", "q");
  queryCommand.action(async () => {
    throw new Error("Generated tRPC invocation for search.query is not wired yet.");
  });

  const savedCreateCommand = command.command("saved-create");
  savedCreateCommand.description("search savedCreate");
  savedCreateCommand.option("--json", "Emit JSON output");
  savedCreateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for search.savedCreate is not wired yet.");
  });

  const savedDeleteCommand = command.command("saved-delete");
  savedDeleteCommand.description("search savedDelete");
  savedDeleteCommand.option("--json", "Emit JSON output");
  savedDeleteCommand.option("--id <string>", "id");
  savedDeleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for search.savedDelete is not wired yet.");
  });

  const savedListCommand = command.command("saved-list");
  savedListCommand.description("search savedList");
  savedListCommand.option("--json", "Emit JSON output");
  savedListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for search.savedList is not wired yet.");
  });

  const suggestCommand = command.command("suggest");
  suggestCommand.description("search suggest");
  suggestCommand.option("--json", "Emit JSON output");
  suggestCommand.option("--q <string>", "q");
  suggestCommand.action(async () => {
    throw new Error("Generated tRPC invocation for search.suggest is not wired yet.");
  });

  return command;
}
