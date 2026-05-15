import { Command } from "commander";
import { createTemplateApiCallerFromEnv } from "@work-management/interface/http/template-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createTemplatesCommand(): Command {
  const command = new Command("templates");
  command.description("Generated templates commands.");

  const applyTemplateCommand = command.command("apply-template");
  applyTemplateCommand.description("templates applyTemplate");
  applyTemplateCommand.option("--json", "Emit JSON output");
  applyTemplateCommand.option("--override-json <json>", "override-json");
  applyTemplateCommand.option("--template-id <string>", "template-id");
  applyTemplateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await templateClient().applyTemplate(compact({
        templateId: requiredOption(options, "templateId"),
        overrides: parseOptionalJsonObject(options.overrideJson, "overrideJson"),
      }))
    );
  });

  const createCommand = command.command("create");
  createCommand.description("templates create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--description <string>", "description");
  createCommand.option("--name <string>", "name");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--template-data-json <json>", "template-data-json");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await templateClient().create(compact({
        description: options.description,
        name: requiredOption(options, "name"),
        projectId: options.projectId,
        templateData: parseRequiredJsonObject(options.templateDataJson, "templateDataJson"),
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("templates delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--template-id <string>", "template-id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await templateClient().delete({ templateId: requiredOption(options, "templateId") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("templates list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await templateClient().list(compact({ projectId: options.projectId }))
    );
  });

  const setDefaultCommand = command.command("set-default");
  setDefaultCommand.description("templates setDefault");
  setDefaultCommand.option("--json", "Emit JSON output");
  setDefaultCommand.option("--project-id <string>", "project-id");
  setDefaultCommand.option("--template-id <string>", "template-id");
  setDefaultCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await templateClient().setDefault({
        projectId: requiredOption(options, "projectId"),
        templateId: requiredOption(options, "templateId"),
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

function templateClient() {
  const caller = createTemplateApiCallerFromEnv();
  if (!caller) {
    throw new Error("Template API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.templates;
}

function parseRequiredJsonObject(value: unknown, name: string): JsonRecord {
  const parsed = parseOptionalJsonObject(value, name);
  if (parsed) return parsed;
  throw new Error(`${name} is required.`);
}

function parseOptionalJsonObject(value: unknown, name: string): JsonRecord | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
  throw new Error(`${name} must be a JSON object.`);
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
