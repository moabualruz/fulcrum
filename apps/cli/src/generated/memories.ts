import { Command, Option } from "commander";

export function createMemoriesCommand(): Command {
  const command = new Command("memories");
  command.description("Generated memories commands.");

  const createCommand = command.command("create");
  createCommand.description("memories create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for memories.create requires an explicit surface adapter.");
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
  deleteCommand.description("memories delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for memories.delete requires an explicit surface adapter.");
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
  getCommand.description("memories get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for memories.get requires an explicit surface adapter.");
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
  listCommand.description("memories list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--archived", "archived");
  listCommand.option("--global", "global");
  listCommand.addOption(new Option("--importance <choice>", "importance").choices([]));
  listCommand.addOption(new Option("--kind <choice>", "kind").choices([]));
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--offset <number>", "offset", Number.parseFloat);
  listCommand.addOption(new Option("--source <choice>", "source").choices([]));
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for memories.list requires an explicit surface adapter.");
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

  const searchCommand = command.command("search");
  searchCommand.description("memories search");
  searchCommand.option("--json", "Emit JSON output");
  searchCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for memories.search requires an explicit surface adapter.");
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
  updateCommand.description("memories update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for memories.update requires an explicit surface adapter.");
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
