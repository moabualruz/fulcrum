import { Command, Option } from "commander";

export function createRoutingCommand(): Command {
  const command = new Command("routing");
  command.description("Generated routing commands.");

  const createCommand = command.command("create");
  createCommand.description("routing create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--enabled", "enabled");
  createCommand.option("--priority <number>", "priority", Number.parseFloat);
  createCommand.addOption(new Option("--source <choice>", "source").choices([]));
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.create is not wired yet.");
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
  deleteCommand.description("routing delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.delete is not wired yet.");
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

  const dryRunCommand = command.command("dry-run");
  dryRunCommand.description("routing dryRun");
  dryRunCommand.option("--json", "Emit JSON output");
  dryRunCommand.option("--task-json-agent-override <string>", "task-json-agent-override");
  dryRunCommand.option("--task-json-kind <string>", "task-json-kind");
  dryRunCommand.option("--task-json-title <string>", "task-json-title");
  dryRunCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.dryRun is not wired yet.");
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
  getCommand.description("routing get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.get is not wired yet.");
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
  listCommand.description("routing list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.list is not wired yet.");
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

  const testCommand = command.command("test");
  testCommand.description("routing test");
  testCommand.option("--json", "Emit JSON output");
  testCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.test is not wired yet.");
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
  updateCommand.description("routing update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--enabled", "enabled");
  updateCommand.option("--priority <number>", "priority", Number.parseFloat);
  updateCommand.addOption(new Option("--source <choice>", "source").choices([]));
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.update is not wired yet.");
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
