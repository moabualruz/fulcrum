import { Command, Option } from "commander";

export function createRelationshipsCommand(): Command {
  const command = new Command("relationships");
  command.description("Generated relationships commands.");

  const blockedItemsCommand = command.command("blocked-items");
  blockedItemsCommand.description("relationships blockedItems");
  blockedItemsCommand.option("--json", "Emit JSON output");
  blockedItemsCommand.option("--project-id <string>", "project-id");
  blockedItemsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.blockedItems requires an explicit surface adapter.");
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

  const blockersCommand = command.command("blockers");
  blockersCommand.description("relationships blockers");
  blockersCommand.option("--json", "Emit JSON output");
  blockersCommand.option("--task-id <string>", "task-id");
  blockersCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.blockers requires an explicit surface adapter.");
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
  createCommand.description("relationships create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--source-task-id <string>", "source-task-id");
  createCommand.option("--target-task-id <string>", "target-task-id");
  createCommand.addOption(new Option("--type <choice>", "type").choices(["blocks","relates_to","duplicate_of"]));
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.create requires an explicit surface adapter.");
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
  deleteCommand.description("relationships delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--relationship-id <string>", "relationship-id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.delete requires an explicit surface adapter.");
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

  const listBlockedByCommand = command.command("list-blocked-by");
  listBlockedByCommand.description("relationships listBlockedBy");
  listBlockedByCommand.option("--json", "Emit JSON output");
  listBlockedByCommand.option("--task-id <string>", "task-id");
  listBlockedByCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.listBlockedBy requires an explicit surface adapter.");
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

  const listForTaskCommand = command.command("list-for-task");
  listForTaskCommand.description("relationships listForTask");
  listForTaskCommand.option("--json", "Emit JSON output");
  listForTaskCommand.option("--task-id <string>", "task-id");
  listForTaskCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.listForTask requires an explicit surface adapter.");
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

  const markAsDuplicateCommand = command.command("mark-as-duplicate");
  markAsDuplicateCommand.description("relationships markAsDuplicate");
  markAsDuplicateCommand.option("--json", "Emit JSON output");
  markAsDuplicateCommand.option("--auto-close", "auto-close");
  markAsDuplicateCommand.option("--source-task-id <string>", "source-task-id");
  markAsDuplicateCommand.option("--target-task-id <string>", "target-task-id");
  markAsDuplicateCommand.option("--transfer-watchers", "transfer-watchers");
  markAsDuplicateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for relationships.markAsDuplicate requires an explicit surface adapter.");
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
