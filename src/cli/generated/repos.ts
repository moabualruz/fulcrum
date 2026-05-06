import { Command, Option } from "commander";

export function createReposCommand(): Command {
  const command = new Command("repos");
  command.description("Generated repos commands.");

  const getCommand = command.command("get");
  getCommand.description("repos get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.get requires an explicit surface adapter.");
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
  listCommand.description("repos list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-archived", "include-archived");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.list requires an explicit surface adapter.");
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

  const registerCommand = command.command("register");
  registerCommand.description("repos register");
  registerCommand.option("--json", "Emit JSON output");
  registerCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.register requires an explicit surface adapter.");
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

  const statusRepoCommand = command.command("status-repo");
  statusRepoCommand.description("repos statusRepo");
  statusRepoCommand.option("--json", "Emit JSON output");
  statusRepoCommand.option("--repo-id <string>", "repo-id");
  statusRepoCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.statusRepo requires an explicit surface adapter.");
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

  const syncCommand = command.command("sync");
  syncCommand.description("repos sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.option("--id <string>", "id");
  syncCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.sync requires an explicit surface adapter.");
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

  const syncRepoCommand = command.command("sync-repo");
  syncRepoCommand.description("repos syncRepo");
  syncRepoCommand.option("--json", "Emit JSON output");
  syncRepoCommand.option("--repo-id <string>", "repo-id");
  syncRepoCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.syncRepo requires an explicit surface adapter.");
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

  const unregisterCommand = command.command("unregister");
  unregisterCommand.description("repos unregister");
  unregisterCommand.option("--json", "Emit JSON output");
  unregisterCommand.option("--id <string>", "id");
  unregisterCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repos.unregister requires an explicit surface adapter.");
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
