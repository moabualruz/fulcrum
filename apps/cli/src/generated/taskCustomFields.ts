import { Command } from "commander";
import { createCustomFieldApiCallerFromEnv } from "@work-management/interface/http/custom-field-api-client.ts";
import {
  requiredOption,
  runGeneratedAction,
} from "./custom_fields.ts";

export function createTaskCustomFieldsCommand(): Command {
  const command = new Command("taskCustomFields");
  command.description("Generated taskCustomFields commands.");

  const clearCommand = command.command("clear");
  clearCommand.description("taskCustomFields clear");
  clearCommand.option("--json", "Emit JSON output");
  clearCommand.option("--field-def-id <string>", "field-def-id");
  clearCommand.option("--task-id <string>", "task-id");
  clearCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await taskCustomFieldClient().clear({
        taskId: requiredOption(options, "taskId"),
        fieldDefId: requiredOption(options, "fieldDefId"),
      })
    );
  });

  const setCommand = command.command("set");
  setCommand.description("taskCustomFields set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--field-def-id <string>", "field-def-id");
  setCommand.option("--task-id <string>", "task-id");
  setCommand.option("--value <string>", "value");
  setCommand.option("--value-json <json>", "value-json");
  setCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await taskCustomFieldClient().set({
        taskId: requiredOption(options, "taskId"),
        fieldDefId: requiredOption(options, "fieldDefId"),
        value: valueOption(options),
      })
    );
  });

  return command;
}

function taskCustomFieldClient() {
  const caller = createCustomFieldApiCallerFromEnv();
  if (!caller) {
    throw new Error("Custom field API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.taskCustomFields;
}

function valueOption(options: Record<string, unknown>): unknown {
  if (typeof options.valueJson === "string" && options.valueJson.trim()) return JSON.parse(options.valueJson);
  return requiredOption(options, "value");
}
