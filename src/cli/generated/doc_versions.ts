import { Command, Option } from "commander";

export function createDocVersionsCommand(): Command {
  const command = new Command("doc_versions");
  command.description("Generated doc_versions commands.");

  const diffCommand = command.command("diff");
  diffCommand.description("doc_versions diff");
  diffCommand.option("--json", "Emit JSON output");
  diffCommand.option("--document-id <string>", "document-id");
  diffCommand.option("--version-id <string>", "version-id");
  diffCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_versions.diff requires an explicit surface adapter.");
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
  listCommand.option("--document-id <string>", "document-id");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_versions.list requires an explicit surface adapter.");
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
  restoreCommand.option("--document-id <string>", "document-id");
  restoreCommand.option("--version-id <string>", "version-id");
  restoreCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_versions.restore requires an explicit surface adapter.");
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
