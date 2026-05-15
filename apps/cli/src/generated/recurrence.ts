import { Command, Option } from "commander";

import { createTaskRecurrenceApiCallerFromEnv } from "@work-management/interface/http/task-recurrence-api-client.ts";

export function createRecurrenceCommand(): Command {
  const command = new Command("recurrence");
  command.description("Generated recurrence commands.");

  const createCommand = command.command("create");
  createCommand.description("recurrence create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--cron-expression <string>", "cron-expression");
  createCommand.option("--include-subtasks", "include-subtasks");
  createCommand.option("--interval-days <number>", "interval-days", Number.parseFloat);
  createCommand.option("--max-occurrences <number>", "max-occurrences", Number.parseFloat);
  createCommand.option("--task-id <string>", "task-id");
  createCommand.option("--timezone <string>", "timezone");
  createCommand.addOption(new Option("--trigger-type <choice>", "trigger-type").choices(["schedule", "on_complete"]));
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await recurrenceClient().create({
        cronExpression: options.cronExpression,
        includeSubtasks: options.includeSubtasks,
        intervalDays: options.intervalDays,
        maxOccurrences: options.maxOccurrences,
        taskId: requiredOption(options, "taskId"),
        timezone: options.timezone,
        triggerType: requiredOption(options, "triggerType"),
      })
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("recurrence delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--rule-id <string>", "rule-id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await recurrenceClient().delete({ ruleId: requiredOption(options, "ruleId") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("recurrence list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--task-id <string>", "task-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await recurrenceClient().list({ taskId: requiredOption(options, "taskId") })
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

function recurrenceClient() {
  const caller = createTaskRecurrenceApiCallerFromEnv();
  if (!caller) {
    throw new Error("Task recurrence API caller is not configured. Set FULCRUM_SERVER_URL and FULCRUM_ORG_ID.");
  }
  return caller.recurrence;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
