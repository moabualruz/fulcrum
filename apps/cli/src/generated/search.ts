import { Command, Option } from "commander";

export function createSearchCommand(): Command {
  const command = new Command("search");
  command.description("Generated search commands.");

  const queryCommand = command.command("query");
  queryCommand.description("search query");
  queryCommand.option("--json", "Emit JSON output");
  queryCommand.option("--facets", "facets");
  queryCommand.option("--filters-date-range-from <string>", "filters-date-range-from");
  queryCommand.option("--filters-date-range-to <string>", "filters-date-range-to");
  queryCommand.option("--limit <number>", "limit", Number.parseFloat);
  queryCommand.option("--offset <number>", "offset", Number.parseFloat);
  queryCommand.option("--term <string>", "term");
  queryCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.query requires an explicit surface adapter.");
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

  const recordClickCommand = command.command("record-click");
  recordClickCommand.description("search recordClick");
  recordClickCommand.option("--json", "Emit JSON output");
  recordClickCommand.option("--position <number>", "position", Number.parseFloat);
  recordClickCommand.option("--query <string>", "query");
  recordClickCommand.option("--result-id <string>", "result-id");
  recordClickCommand.option("--result-kind <string>", "result-kind");
  recordClickCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.recordClick requires an explicit surface adapter.");
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

  const savedCreateCommand = command.command("saved-create");
  savedCreateCommand.description("search savedCreate");
  savedCreateCommand.option("--json", "Emit JSON output");
  savedCreateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.savedCreate requires an explicit surface adapter.");
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

  const savedDeleteCommand = command.command("saved-delete");
  savedDeleteCommand.description("search savedDelete");
  savedDeleteCommand.option("--json", "Emit JSON output");
  savedDeleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.savedDelete requires an explicit surface adapter.");
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

  const savedListCommand = command.command("saved-list");
  savedListCommand.description("search savedList");
  savedListCommand.option("--json", "Emit JSON output");
  savedListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.savedList requires an explicit surface adapter.");
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

  const savedUpdateCommand = command.command("saved-update");
  savedUpdateCommand.description("search savedUpdate");
  savedUpdateCommand.option("--json", "Emit JSON output");
  savedUpdateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.savedUpdate requires an explicit surface adapter.");
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

  const snapshotCommand = command.command("snapshot");
  snapshotCommand.description("search snapshot");
  snapshotCommand.option("--json", "Emit JSON output");
  snapshotCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.snapshot requires an explicit surface adapter.");
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

  const suggestCommand = command.command("suggest");
  suggestCommand.description("search suggest");
  suggestCommand.option("--json", "Emit JSON output");
  suggestCommand.option("--limit <number>", "limit", Number.parseFloat);
  suggestCommand.option("--term <string>", "term");
  suggestCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for search.suggest requires an explicit surface adapter.");
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
