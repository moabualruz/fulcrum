import { Command, Option } from "commander";
import { createAuditApiClientFromEnv, type AuditApiFilters } from "@workflow-coordination/interface/http/audit-api-client.ts";

export function createAuditCommand(): Command {
  const command = new Command("audit");
  command.description("Generated audit commands.");

  const exportCommand = command.command("export");
  exportCommand.description("audit export");
  exportCommand.option("--json", "Emit JSON output");
  exportCommand.addOption(new Option("--format <choice>", "export format").choices(["json", "csv"]).default("json"));
  addAuditFilterOptions(exportCommand);
  exportCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await auditClient().export({
        ...auditFilters(options),
        format: options.format === "csv" ? "csv" : "json",
      })
    );
  });

  const queryCommand = command.command("query");
  queryCommand.description("audit query");
  queryCommand.option("--json", "Emit JSON output");
  addAuditFilterOptions(queryCommand);
  queryCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await auditClient().query(auditFilters(options))
    );
  });

  const retentionPolicyCommand = command.command("retention-policy");
  retentionPolicyCommand.description("Generated audit retention policy commands.");

  const retentionPolicyGetCommand = retentionPolicyCommand.command("get");
  retentionPolicyGetCommand.description("audit retentionPolicy get");
  retentionPolicyGetCommand.option("--json", "Emit JSON output");
  retentionPolicyGetCommand.option("--project-id <string>", "project id");
  retentionPolicyGetCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await auditClient().retentionPolicy.get({ projectId: options.projectId })
    );
  });

  const retentionPolicyListCommand = retentionPolicyCommand.command("list");
  retentionPolicyListCommand.description("audit retentionPolicy list");
  retentionPolicyListCommand.option("--json", "Emit JSON output");
  retentionPolicyListCommand.option("--project-id <string>", "project id");
  retentionPolicyListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await auditClient().retentionPolicy.list({ projectId: options.projectId })
    );
  });

  const retentionPolicySetCommand = retentionPolicyCommand.command("set");
  retentionPolicySetCommand.description("audit retentionPolicy set");
  retentionPolicySetCommand.option("--json", "Emit JSON output");
  retentionPolicySetCommand.option("--project-id <string>", "project id");
  retentionPolicySetCommand.option("--retain-days <number>", "retain-days", Number.parseFloat);
  retentionPolicySetCommand.action(async (options) => {
    const retainDays = requiredNumberOption(options, "retainDays");
    await runGeneratedAction(options, async () =>
      await auditClient().retentionPolicy.set({
        projectId: options.projectId,
        retainDays,
      })
    );
  });

  return command;
}

function addAuditFilterOptions(command: Command): void {
  command.option("--project-id <string>", "project id");
  command.option("--user-id <string>", "user id");
  command.option("--kind <string>", "subject kind");
  command.option("--subject-kind <string>", "subject kind");
  command.option("--verb <string>", "event verb");
  command.option("--since <string>", "start timestamp");
  command.option("--until <string>", "end timestamp");
  command.option("--limit <number>", "limit", Number.parseFloat);
  command.option("--offset <number>", "offset", Number.parseFloat);
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function auditClient() {
  const caller = createAuditApiClientFromEnv();
  if (!caller) {
    throw new Error("Audit API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller;
}

function auditFilters(options: Record<string, unknown>): AuditApiFilters {
  return compact({
    projectId: stringOption(options, "projectId"),
    userId: stringOption(options, "userId"),
    kind: stringOption(options, "kind"),
    subjectKind: stringOption(options, "subjectKind"),
    verb: stringOption(options, "verb"),
    since: stringOption(options, "since"),
    until: stringOption(options, "until"),
    limit: numberOption(options, "limit"),
    offset: numberOption(options, "offset"),
  }) as AuditApiFilters;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) {
    console.log(JSON.stringify(result));
    return;
  }
  if (typeof result === "object") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function stringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberOption(options: Record<string, unknown>, key: string): number | undefined {
  const value = options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredNumberOption(options: Record<string, unknown>, key: string): number {
  const value = numberOption(options, key);
  if (value !== undefined) return value;
  throw new Error(`${key} is required.`);
}
