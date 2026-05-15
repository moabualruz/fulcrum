import { Command, Option } from "commander";

import { createSearchApiCallerFromEnv } from "@knowledge-workspace/interface/http/search-api-client.ts";

export function createSearchCommand(): Command {
  const command = new Command("search");
  command.description("Generated search commands.");

  const queryCommand = command.command("query");
  queryCommand.description("search query");
  queryCommand.option("--json", "Emit JSON output");
  queryCommand.option("--facets", "facets");
  queryCommand.option("--filters-date-range-from <string>", "filters-date-range-from");
  queryCommand.option("--filters-date-range-to <string>", "filters-date-range-to");
  queryCommand.addOption(new Option("--filters-scope <choice>", "filters-scope").choices(["current","all","global"]));
  queryCommand.option("--limit <number>", "limit", Number.parseFloat);
  queryCommand.option("--offset <number>", "offset", Number.parseFloat);
  queryCommand.option("--term <string>", "term");
  queryCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await searchClient().query(compact({
        term: requiredOption(options, "term"),
        filtersScope: options.filtersScope,
        limit: options.limit,
        offset: options.offset,
      }))
    );
  });

  const recordClickCommand = command.command("record-click");
  recordClickCommand.description("search recordClick");
  recordClickCommand.option("--json", "Emit JSON output");
  recordClickCommand.option("--position <number>", "position", Number.parseFloat);
  recordClickCommand.option("--query <string>", "query");
  recordClickCommand.option("--result-id <string>", "result-id");
  recordClickCommand.option("--result-kind <string>", "result-kind");
  recordClickCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await searchClient().recordClick({
        query: requiredOption(options, "query"),
        resultId: requiredOption(options, "resultId"),
        resultKind: requiredOption(options, "resultKind"),
        position: options.position,
      })
    );
  });

  const savedCreateCommand = command.command("saved-create");
  savedCreateCommand.description("search savedCreate");
  savedCreateCommand.option("--json", "Emit JSON output");
  savedCreateCommand.option("--name <string>", "name");
  savedCreateCommand.option("--project-id <string>", "project-id");
  savedCreateCommand.option("--query-json-text <string>", "query-json-text");
  savedCreateCommand.addOption(searchScopeOption());
  savedCreateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await searchClient().savedCreate({
        name: requiredOption(options, "name"),
        queryJson: parseJsonOption(options.queryJsonText),
        scope: options.scope ?? "private",
        projectId: options.projectId,
      })
    );
  });

  const savedDeleteCommand = command.command("saved-delete");
  savedDeleteCommand.description("search savedDelete");
  savedDeleteCommand.option("--json", "Emit JSON output");
  savedDeleteCommand.option("--id <string>", "id");
  savedDeleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const result = await searchClient().savedDelete({ id: requiredOption(options, "id") });
      return result ?? { ok: true };
    });
  });

  const savedListCommand = command.command("saved-list");
  savedListCommand.description("search savedList");
  savedListCommand.option("--json", "Emit JSON output");
  savedListCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await searchClient().savedList());
  });

  const savedUpdateCommand = command.command("saved-update");
  savedUpdateCommand.description("search savedUpdate");
  savedUpdateCommand.option("--json", "Emit JSON output");
  savedUpdateCommand.option("--id <string>", "id");
  savedUpdateCommand.option("--name <string>", "name");
  savedUpdateCommand.option("--project-id <string>", "project-id");
  savedUpdateCommand.option("--query-json-text <string>", "query-json-text");
  savedUpdateCommand.addOption(searchScopeOption());
  savedUpdateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await searchClient().savedUpdate({
        id: requiredOption(options, "id"),
        ...compact({
          name: options.name,
          queryJson: parseOptionalJsonOption(options.queryJsonText),
          scope: options.scope,
          projectId: options.projectId,
        }),
      })
    );
  });

  const snapshotCommand = command.command("snapshot");
  snapshotCommand.description("search snapshot");
  snapshotCommand.option("--json", "Emit JSON output");
  snapshotCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await searchClient().snapshot());
  });

  const suggestCommand = command.command("suggest");
  suggestCommand.description("search suggest");
  suggestCommand.option("--json", "Emit JSON output");
  suggestCommand.option("--limit <number>", "limit", Number.parseFloat);
  suggestCommand.option("--term <string>", "term");
  suggestCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await searchClient().suggest(compact({
        term: requiredOption(options, "term"),
        limit: options.limit,
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

function searchClient() {
  const caller = createSearchApiCallerFromEnv();
  if (!caller) {
    throw new Error("Search API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, FULCRUM_USER_ID, and FULCRUM_API_TOKEN or FULCRUM_PUBLIC_API_TOKEN.");
  }
  return caller.search;
}

function searchScopeOption(): Option {
  return new Option("--scope <choice>", "scope").choices(["private", "project", "org"]);
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

function parseJsonOption(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("queryJsonText is required.");
  }
  return parseJsonRecord(value);
}

function parseOptionalJsonOption(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("queryJsonText must be JSON text.");
  return parseJsonRecord(value);
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("queryJsonText must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
