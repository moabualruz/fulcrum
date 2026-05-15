import { Command, Option } from "commander";

import { createSavedViewApiCallerFromEnv } from "@work-management/interface/http/saved-view-api-client.ts";

export function createSavedViewsCommand(): Command {
  const command = new Command("saved_views");
  command.description("Generated saved_views commands.");

  const listCommand = command.command("list");
  listCommand.description("saved_views list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await savedViewClient().list(compact({ projectId: options.projectId }))
    );
  });

  const getCommand = command.command("get");
  getCommand.description("saved_views get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await savedViewClient().get({ id: requiredOption(options, "id") })
    );
  });

  const createCommand = command.command("create");
  createCommand.description("saved_views create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--project-id <string>", "project id");
  createCommand.option("--name <string>", "name");
  createCommand.addOption(savedViewScopeOption());
  createCommand.addOption(savedViewTypeOption());
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await savedViewClient().create(compact({
        projectId: requiredOption(options, "projectId"),
        name: requiredOption(options, "name"),
        scope: options.scope,
        viewType: options.viewType,
      }))
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("saved_views update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.addOption(savedViewScopeOption());
  updateCommand.addOption(savedViewTypeOption());
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await savedViewClient().update({
        id: requiredOption(options, "id"),
        ...compact({
          name: options.name,
          scope: options.scope,
          viewType: options.viewType,
        }),
      })
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("saved_views delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const result = await savedViewClient().delete({ id: requiredOption(options, "id") });
      return result ?? { ok: true };
    });
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

function savedViewClient() {
  const caller = createSavedViewApiCallerFromEnv();
  if (!caller) {
    throw new Error("Saved-view API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.savedViews;
}

function savedViewScopeOption(): Option {
  return new Option("--scope <choice>", "scope").choices(["private", "project", "org"]);
}

function savedViewTypeOption(): Option {
  return new Option("--view-type <choice>", "view type").choices(["kanban", "table", "calendar", "timeline", "list"]);
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
