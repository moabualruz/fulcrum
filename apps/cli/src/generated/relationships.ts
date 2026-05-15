import { Command, Option } from "commander";
import { createRelationshipApiCallerFromEnv } from "@work-management/interface/http/relationship-api-client.ts";

export function createRelationshipsCommand(): Command {
  const command = new Command("relationships");
  command.description("Generated relationships commands.");

  const blockedItemsCommand = command.command("blocked-items");
  blockedItemsCommand.description("relationships blockedItems");
  blockedItemsCommand.option("--json", "Emit JSON output");
  blockedItemsCommand.option("--project-id <string>", "project-id");
  blockedItemsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().blockedItems({ projectId: requiredOption(options, "projectId") })
    );
  });

  const blockersCommand = command.command("blockers");
  blockersCommand.description("relationships blockers");
  blockersCommand.option("--json", "Emit JSON output");
  blockersCommand.option("--task-id <string>", "task-id");
  blockersCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().blockers({ taskId: requiredOption(options, "taskId") })
    );
  });

  const createCommand = command.command("create");
  createCommand.description("relationships create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--source-task-id <string>", "source-task-id");
  createCommand.option("--target-task-id <string>", "target-task-id");
  createCommand.addOption(new Option("--type <choice>", "type").choices(["blocks","relates_to","duplicate_of"]));
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().create({
        sourceTaskId: requiredOption(options, "sourceTaskId"),
        targetTaskId: requiredOption(options, "targetTaskId"),
        type: requiredOption(options, "type"),
      })
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("relationships delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--relationship-id <string>", "relationship-id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().delete({ relationshipId: requiredOption(options, "relationshipId") })
    );
  });

  const listBlockedByCommand = command.command("list-blocked-by");
  listBlockedByCommand.description("relationships listBlockedBy");
  listBlockedByCommand.option("--json", "Emit JSON output");
  listBlockedByCommand.option("--task-id <string>", "task-id");
  listBlockedByCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().listBlockedBy({ taskId: requiredOption(options, "taskId") })
    );
  });

  const listForTaskCommand = command.command("list-for-task");
  listForTaskCommand.description("relationships listForTask");
  listForTaskCommand.option("--json", "Emit JSON output");
  listForTaskCommand.option("--task-id <string>", "task-id");
  listForTaskCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().listForTask({ taskId: requiredOption(options, "taskId") })
    );
  });

  const markAsDuplicateCommand = command.command("mark-as-duplicate");
  markAsDuplicateCommand.description("relationships markAsDuplicate");
  markAsDuplicateCommand.option("--json", "Emit JSON output");
  markAsDuplicateCommand.option("--auto-close", "auto-close");
  markAsDuplicateCommand.option("--source-task-id <string>", "source-task-id");
  markAsDuplicateCommand.option("--target-task-id <string>", "target-task-id");
  markAsDuplicateCommand.option("--transfer-watchers", "transfer-watchers");
  markAsDuplicateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().markAsDuplicate({
        sourceTaskId: requiredOption(options, "sourceTaskId"),
        targetTaskId: requiredOption(options, "targetTaskId"),
        autoClose: options.autoClose === true,
        transferWatchers: options.transferWatchers === true,
      })
    );
  });

  const summaryCommand = command.command("summary");
  summaryCommand.description("relationships summary");
  summaryCommand.option("--json", "Emit JSON output");
  summaryCommand.option("--entity-id <string>", "entity-id");
  summaryCommand.addOption(new Option("--entity-kind <choice>", "entity-kind").choices(["workspace","project","parent_project","subproject","repo","work_item","doc","context_bundle","routing_decision","run","live_session","artifact","memory","automation","audit"]));
  summaryCommand.option("--entity-label <string>", "entity-label");
  summaryCommand.option("--project-id <string>", "project-id");
  summaryCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await relationshipClient().summary({
        projectId: requiredOption(options, "projectId"),
        entity: compact({
          kind: requiredOption(options, "entityKind"),
          id: requiredOption(options, "entityId"),
          label: options.entityLabel,
        }),
      })
    );
  });

  return command;
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

function relationshipClient() {
  const caller = createRelationshipApiCallerFromEnv();
  if (!caller) {
    throw new Error("Relationship API caller is not configured. Set FULCRUM_SERVER_URL and FULCRUM_ORG_ID.");
  }
  return caller.relationships;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}
