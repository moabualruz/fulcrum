import { Command, Option } from "commander";

export function createDocVersionsCommand(): Command {
  const command = new Command("doc_versions");
  command.description("Generated doc_versions commands.");

  const getCommand = command.command("get");
  getCommand.description("doc_versions get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_versions.get is not wired yet.");
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
  listCommand.description("doc_versions list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_versions.list is not wired yet.");
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

  const restoreCommand = command.command("restore");
  restoreCommand.description("doc_versions restore");
  restoreCommand.option("--json", "Emit JSON output");
  restoreCommand.option("--id <string>", "id");
  restoreCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_versions.restore is not wired yet.");
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
