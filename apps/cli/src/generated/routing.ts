import { Command, Option } from "commander";

export function createRoutingCommand(): Command {
  const command = new Command("routing");
  command.description("Generated routing commands.");

  const configUpdateLlmGateCommand = command.command("config update-llm-gate");
  configUpdateLlmGateCommand.description("routing config updateLlmGate");
  configUpdateLlmGateCommand.option("--json", "Emit JSON output");
  configUpdateLlmGateCommand.option("--enabled", "enabled");
  configUpdateLlmGateCommand.addOption(new Option("--input-mode <choice>", "input-mode").choices(["task_facts","task_plus_history","full_context"]));
  configUpdateLlmGateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.config.updateLlmGate requires an explicit surface adapter.");
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
  createCommand.description("routing create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--dry-run-id <string>", "dry-run-id");
  createCommand.option("--enabled", "enabled");
  createCommand.option("--priority <number>", "priority", Number.parseFloat);
  createCommand.addOption(new Option("--source <choice>", "source").choices([]));
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.create requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for routing.delete requires an explicit surface adapter.");
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

  const draftsApproveCommand = command.command("drafts approve");
  draftsApproveCommand.description("routing drafts approve");
  draftsApproveCommand.option("--json", "Emit JSON output");
  draftsApproveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.drafts.approve requires an explicit surface adapter.");
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

  const draftsDeleteCommand = command.command("drafts delete");
  draftsDeleteCommand.description("routing drafts delete");
  draftsDeleteCommand.option("--json", "Emit JSON output");
  draftsDeleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.drafts.delete requires an explicit surface adapter.");
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

  const draftsListCommand = command.command("drafts list");
  draftsListCommand.description("routing drafts list");
  draftsListCommand.option("--json", "Emit JSON output");
  draftsListCommand.option("--status <string>", "status");
  draftsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.drafts.list requires an explicit surface adapter.");
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

  const draftsUpdateCommand = command.command("drafts update");
  draftsUpdateCommand.description("routing drafts update");
  draftsUpdateCommand.option("--json", "Emit JSON output");
  draftsUpdateCommand.option("--action-agent <string>", "action-agent");
  draftsUpdateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.drafts.update requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for routing.dryRun requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for routing.get requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for routing.list requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for routing.test requires an explicit surface adapter.");
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
  updateCommand.option("--dry-run-id <string>", "dry-run-id");
  updateCommand.option("--enabled", "enabled");
  updateCommand.option("--priority <number>", "priority", Number.parseFloat);
  updateCommand.addOption(new Option("--source <choice>", "source").choices([]));
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for routing.update requires an explicit surface adapter.");
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
