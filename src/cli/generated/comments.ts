import { Command, Option } from "commander";

export function createCommentsCommand(): Command {
  const command = new Command("comments");
  command.description("Generated comments commands.");

  const addReactionCommand = command.command("add-reaction");
  addReactionCommand.description("comments addReaction");
  addReactionCommand.option("--json", "Emit JSON output");
  addReactionCommand.option("--comment-id <string>", "comment-id");
  addReactionCommand.option("--emoji <string>", "emoji");
  addReactionCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.addReaction requires an explicit surface adapter.");
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
  createCommand.description("comments create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--parent-comment-id <string>", "parent-comment-id");
  createCommand.option("--task-id <string>", "task-id");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.create requires an explicit surface adapter.");
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
  deleteCommand.description("comments delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--comment-id <string>", "comment-id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.delete requires an explicit surface adapter.");
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
  listCommand.description("comments list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--task-id <string>", "task-id");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.list requires an explicit surface adapter.");
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

  const removeReactionCommand = command.command("remove-reaction");
  removeReactionCommand.description("comments removeReaction");
  removeReactionCommand.option("--json", "Emit JSON output");
  removeReactionCommand.option("--comment-id <string>", "comment-id");
  removeReactionCommand.option("--emoji <string>", "emoji");
  removeReactionCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.removeReaction requires an explicit surface adapter.");
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
  resolveCommand.description("comments resolve");
  resolveCommand.option("--json", "Emit JSON output");
  resolveCommand.option("--comment-id <string>", "comment-id");
  resolveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.resolve requires an explicit surface adapter.");
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

  const subscribeCommand = command.command("subscribe");
  subscribeCommand.description("comments subscribe");
  subscribeCommand.option("--json", "Emit JSON output");
  subscribeCommand.option("--task-id <string>", "task-id");
  subscribeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.subscribe requires an explicit surface adapter.");
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

  const threadedCommand = command.command("threaded");
  threadedCommand.description("comments threaded");
  threadedCommand.option("--json", "Emit JSON output");
  threadedCommand.option("--task-id <string>", "task-id");
  threadedCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.threaded requires an explicit surface adapter.");
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

  const unresolveCommand = command.command("unresolve");
  unresolveCommand.description("comments unresolve");
  unresolveCommand.option("--json", "Emit JSON output");
  unresolveCommand.option("--comment-id <string>", "comment-id");
  unresolveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.unresolve requires an explicit surface adapter.");
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

  const unsubscribeCommand = command.command("unsubscribe");
  unsubscribeCommand.description("comments unsubscribe");
  unsubscribeCommand.option("--json", "Emit JSON output");
  unsubscribeCommand.option("--task-id <string>", "task-id");
  unsubscribeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.unsubscribe requires an explicit surface adapter.");
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

  const watchersCommand = command.command("watchers");
  watchersCommand.description("comments watchers");
  watchersCommand.option("--json", "Emit JSON output");
  watchersCommand.option("--task-id <string>", "task-id");
  watchersCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for comments.watchers requires an explicit surface adapter.");
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
