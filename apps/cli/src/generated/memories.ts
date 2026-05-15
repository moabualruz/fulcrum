import { Command, Option } from "commander";

import { createMemoryApiCallerFromEnv } from "@knowledge-workspace/interface/http/memory-api-client.ts";

export function createMemoriesCommand(): Command {
  const command = new Command("memories");
  command.description("Generated memories commands.");

  const createCommand = command.command("create");
  createCommand.description("memories create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--project-id <string>", "project id");
  createCommand.option("--global", "create global memory");
  createCommand.addOption(memoryKindOption());
  createCommand.option("--body <string>", "memory body");
  createCommand.option("--tags <csv>", "comma-separated tags");
  createCommand.addOption(memoryImportanceOption());
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().create(compact({
        projectId: options.projectId,
        global: options.global === true,
        kind: options.kind,
        body: requiredOption(options, "body"),
        tags: parseCsv(options.tags),
        importance: options.importance,
        source: "manual",
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("memories delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "memory id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().delete({ id: requiredOption(options, "id") })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("memories get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "memory id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("memories list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project id");
  listCommand.option("--archived", "archived");
  listCommand.option("--global", "global");
  listCommand.addOption(memoryImportanceOption());
  listCommand.addOption(memoryKindOption());
  listCommand.option("--tags <csv>", "comma-separated tags");
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--offset <number>", "offset", Number.parseFloat);
  listCommand.addOption(memorySourceOption());
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().list(compact({
        projectId: options.projectId,
        archived: options.archived === true ? true : undefined,
        global: options.global === true ? true : undefined,
        importance: options.importance,
        kind: options.kind,
        tags: options.tags,
        limit: options.limit,
        offset: options.offset,
        source: options.source,
      }))
    );
  });

  const promoteCommand = command.command("promote");
  promoteCommand.description("memories promote");
  promoteCommand.option("--json", "Emit JSON output");
  promoteCommand.option("--id <string>", "memory id");
  promoteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().promote({ id: requiredOption(options, "id") })
    );
  });

  const searchCommand = command.command("search");
  searchCommand.description("memories search");
  searchCommand.option("--json", "Emit JSON output");
  searchCommand.option("--query <string>", "search query");
  searchCommand.option("--project-id <string>", "project id");
  searchCommand.addOption(memoryKindOption());
  searchCommand.addOption(memoryImportanceOption());
  searchCommand.option("--tags <csv>", "comma-separated tags");
  searchCommand.option("--limit <number>", "limit", Number.parseFloat);
  searchCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().search(compact({
        query: requiredOption(options, "query"),
        projectId: options.projectId,
        kind: options.kind,
        importance: options.importance,
        tags: options.tags,
        limit: options.limit,
      }) as { query: string })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("memories update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "memory id");
  updateCommand.option("--body <string>", "memory body");
  updateCommand.option("--tags <csv>", "comma-separated tags");
  updateCommand.addOption(memoryImportanceOption());
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await memoryClient().update({
        id: requiredOption(options, "id"),
        ...compact({
          body: options.body,
          tags: parseCsv(options.tags),
          importance: options.importance,
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

function memoryClient() {
  const caller = createMemoryApiCallerFromEnv();
  if (!caller) {
    throw new Error("Memory API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_API_TOKEN or FULCRUM_PUBLIC_API_TOKEN.");
  }
  return caller.memories;
}

function memoryKindOption(): Option {
  return new Option("--kind <choice>", "kind").choices([
    "note",
    "decision",
    "blocker",
    "file_ref",
    "section_anchor",
    "link",
    "fact",
  ]);
}

function memoryImportanceOption(): Option {
  return new Option("--importance <choice>", "importance").choices(["low", "medium", "high"]);
}

function memorySourceOption(): Option {
  return new Option("--source <choice>", "source").choices(["heuristic", "llm", "manual"]);
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

function parseCsv(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
