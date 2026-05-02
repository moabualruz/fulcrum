import { Command, Option } from "commander";

export function createAuditCommand(): Command {
  const command = new Command("audit");
  command.description("Generated audit commands.");

  const exportCommand = command.command("export");
  exportCommand.description("audit export");
  exportCommand.option("--json", "Emit JSON output");
  exportCommand.action(async () => {
    throw new Error("Generated tRPC invocation for audit.export is not wired yet.");
  });

  const queryCommand = command.command("query");
  queryCommand.description("audit query");
  queryCommand.option("--json", "Emit JSON output");
  queryCommand.action(async () => {
    throw new Error("Generated tRPC invocation for audit.query is not wired yet.");
  });

  const retentionPolicyGetCommand = command.command("retention-policy get");
  retentionPolicyGetCommand.description("audit retentionPolicy get");
  retentionPolicyGetCommand.option("--json", "Emit JSON output");
  retentionPolicyGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for audit.retentionPolicy.get is not wired yet.");
  });

  const retentionPolicyListCommand = command.command("retention-policy list");
  retentionPolicyListCommand.description("audit retentionPolicy list");
  retentionPolicyListCommand.option("--json", "Emit JSON output");
  retentionPolicyListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for audit.retentionPolicy.list is not wired yet.");
  });

  const retentionPolicySetCommand = command.command("retention-policy set");
  retentionPolicySetCommand.description("audit retentionPolicy set");
  retentionPolicySetCommand.option("--json", "Emit JSON output");
  retentionPolicySetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for audit.retentionPolicy.set is not wired yet.");
  });

  return command;
}
