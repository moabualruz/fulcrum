import { Command, Option } from "commander";
import { createCustomFieldApiCallerFromEnv } from "@work-management/interface/http/custom-field-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createCustomFieldsCommand(): Command {
  const command = new Command("custom_fields");
  command.description("Generated custom_fields commands.");

  const createCommand = command.command("create");
  createCommand.description("custom_fields create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--config-json <json>", "config-json");
  createCommand.option("--name <string>", "name");
  createCommand.option("--options <csv>", "options");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--required", "required");
  createCommand.addOption(new Option("--field-type <choice>", "field-type").choices(["text", "number", "date", "select", "multi_select", "boolean", "checkbox", "user", "url", "json"]));
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await customFieldClient().create(compact({
        projectId: requiredOption(options, "projectId"),
        name: requiredOption(options, "name"),
        type: requiredOption(options, "fieldType"),
        required: options.required === true ? true : undefined,
        configJson: configJson(options),
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("custom_fields delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await customFieldClient().delete({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("custom_fields list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-archived", "include-archived");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await customFieldClient().list(compact({
        projectId: options.projectId,
        includeArchived: options.includeArchived === true ? true : undefined,
      }))
    );
  });

  const reorderCommand = command.command("reorder");
  reorderCommand.description("custom_fields reorder");
  reorderCommand.option("--json", "Emit JSON output");
  reorderCommand.option("--ordered-ids <csv>", "ordered-ids");
  reorderCommand.option("--project-id <string>", "project-id");
  reorderCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await customFieldClient().reorder({
        projectId: requiredOption(options, "projectId"),
        orderedIds: csvRequired(options.orderedIds, "orderedIds"),
      })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("custom_fields update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--config-json <json>", "config-json");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.option("--options <csv>", "options");
  updateCommand.option("--required", "required");
  updateCommand.option("--sort-order <number>", "sort-order", Number.parseFloat);
  updateCommand.addOption(new Option("--field-type <choice>", "field-type").choices(["text", "number", "date", "select", "multi_select", "boolean", "checkbox", "user", "url", "json"]));
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await customFieldClient().update(compact({
        id: requiredOption(options, "id"),
        name: options.name,
        type: options.fieldType,
        configJson: configJson(options),
        required: options.required === true ? true : undefined,
        position: options.sortOrder,
      }))
    );
  });

  return command;
}

export function customFieldClient() {
  const caller = createCustomFieldApiCallerFromEnv();
  if (!caller) {
    throw new Error("Custom field API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.customFields;
}

export async function runGeneratedAction(
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

export function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

export function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

export function parseOptionalJsonObject(value: unknown, name: string): JsonRecord | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
  throw new Error(`${name} must be a JSON object.`);
}

export function csvRequired(value: unknown, name: string): string[] {
  const values = csvOption(value);
  if (values && values.length > 0) return values;
  throw new Error(`${name} is required.`);
}

export function csvOption(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function configJson(options: Record<string, unknown>): JsonRecord | undefined {
  const parsed = parseOptionalJsonObject(options.configJson, "configJson");
  if (parsed) return parsed;
  const optionsList = csvOption(options.options);
  return optionsList ? { options: optionsList } : undefined;
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}
