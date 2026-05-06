import { Command, Option } from "commander";

export function createDocCommentsCommand(): Command {
  const command = new Command("doc_comments");
  command.description("Generated doc_comments commands.");

  const createCommand = command.command("create");
  createCommand.description("doc_comments create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--body-md <string>", "body-md");
  createCommand.option("--doc-id <string>", "doc-id");
  createCommand.option("--parent-comment-id <string>", "parent-comment-id");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_comments.create requires an explicit surface adapter.");
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
  deleteCommand.description("doc_comments delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_comments.delete requires an explicit surface adapter.");
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
  listCommand.description("doc_comments list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--doc-id <string>", "doc-id");
  listCommand.option("--include-resolved", "include-resolved");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_comments.list requires an explicit surface adapter.");
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

  const resolveCommand = command.command("resolve");
  resolveCommand.description("doc_comments resolve");
  resolveCommand.option("--json", "Emit JSON output");
  resolveCommand.option("--id <string>", "id");
  resolveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doc_comments.resolve requires an explicit surface adapter.");
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
