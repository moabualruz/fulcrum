import { Command, Option } from "commander";

export function createAuditCommand(): Command {
  const command = new Command("audit");
  command.description("Generated audit commands.");

  const exportCommand = command.command("export");
  exportCommand.description("audit export");
  exportCommand.option("--json", "Emit JSON output");
  exportCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for audit.export requires an explicit surface adapter.");
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

  const queryCommand = command.command("query");
  queryCommand.description("audit query");
  queryCommand.option("--json", "Emit JSON output");
  queryCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for audit.query requires an explicit surface adapter.");
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

  const retentionPolicyGetCommand = command.command("retention-policy get");
  retentionPolicyGetCommand.description("audit retentionPolicy get");
  retentionPolicyGetCommand.option("--json", "Emit JSON output");
  retentionPolicyGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for audit.retentionPolicy.get requires an explicit surface adapter.");
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

  const retentionPolicyListCommand = command.command("retention-policy list");
  retentionPolicyListCommand.description("audit retentionPolicy list");
  retentionPolicyListCommand.option("--json", "Emit JSON output");
  retentionPolicyListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for audit.retentionPolicy.list requires an explicit surface adapter.");
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

  const retentionPolicySetCommand = command.command("retention-policy set");
  retentionPolicySetCommand.description("audit retentionPolicy set");
  retentionPolicySetCommand.option("--json", "Emit JSON output");
  retentionPolicySetCommand.option("--retain-days <number>", "retain-days", Number.parseFloat);
  retentionPolicySetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for audit.retentionPolicy.set requires an explicit surface adapter.");
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
