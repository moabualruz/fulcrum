import { Command, Option } from "commander";
import { createAutomationApiCallerFromEnv } from "@work-management/interface/http/automation-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createAutomationsCommand(): Command {
  const command = new Command("automations");
  command.description("Generated automations commands.");

  const createCommand = command.command("create");
  createCommand.description("automations create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--action-type <string>", "action-type");
  createCommand.option("--action-config-json <json>", "action-config-json");
  createCommand.option("--condition-field <string>", "condition-field");
  createCommand.addOption(new Option("--condition-operator <choice>", "condition-operator").choices(["equals","not_equals","contains","is_empty","is_not_empty"]));
  createCommand.option("--condition-value <string>", "condition-value");
  createCommand.option("--name <string>", "name");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--trigger-config-json <json>", "trigger-config-json");
  createCommand.option("--trigger-type <string>", "trigger-type");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await automationClient().create(compact({
        actionConfig: parseOptionalJsonObject(options.actionConfigJson, "actionConfigJson"),
        actionType: requiredOption(options, "actionType"),
        condition: parseCondition(options),
        name: requiredOption(options, "name"),
        projectId: requiredOption(options, "projectId"),
        triggerConfig: parseOptionalJsonObject(options.triggerConfigJson, "triggerConfigJson"),
        triggerType: requiredOption(options, "triggerType"),
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("automations delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await automationClient().delete({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("automations list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await automationClient().list({ projectId: requiredOption(options, "projectId") })
    );
  });

  const templatesCommand = command.command("templates");
  templatesCommand.description("automations templates");
  templatesCommand.option("--json", "Emit JSON output");
  templatesCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await automationClient().templates());
  });

  const updateCommand = command.command("update");
  updateCommand.description("automations update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--action-type <string>", "action-type");
  updateCommand.option("--action-config-json <json>", "action-config-json");
  updateCommand.option("--condition-field <string>", "condition-field");
  updateCommand.addOption(new Option("--condition-operator <choice>", "condition-operator").choices(["equals","not_equals","contains","is_empty","is_not_empty"]));
  updateCommand.option("--condition-value <string>", "condition-value");
  updateCommand.option("--enabled", "enabled");
  updateCommand.option("--disabled", "disabled");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.option("--trigger-config-json <json>", "trigger-config-json");
  updateCommand.option("--trigger-type <string>", "trigger-type");
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await automationClient().update(compact({
        actionConfig: parseOptionalJsonObject(options.actionConfigJson, "actionConfigJson"),
        actionType: options.actionType,
        condition: parseCondition(options),
        enabled: enabledOption(options),
        id: requiredOption(options, "id"),
        name: options.name,
        triggerConfig: parseOptionalJsonObject(options.triggerConfigJson, "triggerConfigJson"),
        triggerType: options.triggerType,
      }))
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

function automationClient() {
  const caller = createAutomationApiCallerFromEnv();
  if (!caller) {
    throw new Error("Automation API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.automations;
}

function parseCondition(options: Record<string, unknown>): JsonRecord | undefined {
  if (!options.conditionField && !options.conditionOperator) return undefined;
  return compact({
    field: requiredOption(options, "conditionField"),
    operator: requiredOption(options, "conditionOperator"),
    value: options.conditionValue,
  });
}

function parseOptionalJsonObject(value: unknown, name: string): JsonRecord | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
  throw new Error(`${name} must be a JSON object.`);
}

function enabledOption(options: Record<string, unknown>): boolean | undefined {
  if (options.enabled === true && options.disabled === true) {
    throw new Error("Use either --enabled or --disabled, not both.");
  }
  if (options.enabled === true) return true;
  if (options.disabled === true) return false;
  return undefined;
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

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}
