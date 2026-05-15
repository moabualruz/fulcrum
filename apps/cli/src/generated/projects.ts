import { Command, Option } from "commander";
import { createProjectApiCallerFromEnv } from "@work-management/interface/http/project-api-client.ts";

export function createProjectsCommand(): Command {
  const command = new Command("projects");
  command.description("Generated projects commands.");

  const createCommand = command.command("create");
  createCommand.description("projects create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.addOption(new Option("--kind <choice>", "kind").choices(["workspace","project","subproject"]));
  createCommand.option("--name <string>", "name");
  createCommand.option("--repo-path <string>", "repo-path");
  createCommand.option("--slug <string>", "slug");
  createCommand.option("--template <string>", "template");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await projectClient().create(compact({
        kind: options.kind,
        name: requiredOption(options, "name"),
        repoPath: options.repoPath,
        slug: options.slug,
        template: options.template,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("projects delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const result = await projectClient().delete({ id: requiredOption(options, "id") });
      return result ?? { ok: true };
    });
  });

  const getCommand = command.command("get");
  getCommand.description("projects get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await projectClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("projects list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await projectClient().list());
  });

  const statsCommand = command.command("stats");
  statsCommand.description("projects stats");
  statsCommand.option("--json", "Emit JSON output");
  statsCommand.option("--id <string>", "id");
  statsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await projectClient().stats({ id: requiredOption(options, "id") })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("projects update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await projectClient().update({
        id: requiredOption(options, "id"),
        name: requiredOption(options, "name"),
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

function projectClient() {
  const caller = createProjectApiCallerFromEnv();
  if (!caller) {
    throw new Error("Project API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.projects;
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
