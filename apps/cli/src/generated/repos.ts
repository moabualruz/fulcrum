import { Command, Option } from "commander";

import { createRepositoryApiCallerFromEnv } from "@integration-hub/interface/http/repository-api-client.ts";

export function createReposCommand(): Command {
  const command = new Command("repos");
  command.description("Generated repos commands.");

  const getCommand = command.command("get");
  getCommand.description("repos get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "repository id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("repos list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-archived", "Include archived repositories in the list response.");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoClient().list({ includeArchived: options.includeArchived === true })
    );
  });

  const registerCommand = command.command("register");
  registerCommand.description("repos register");
  registerCommand.option("--json", "Emit JSON output");
  registerCommand.option("--name <string>", "repository name");
  registerCommand.option("--slug <string>", "repository slug");
  registerCommand.addOption(new Option("--kind <choice>", "repository kind").choices(["local", "remote"]));
  registerCommand.option("--local-path <string>", "local repository path");
  registerCommand.option("--remote-url <string>", "remote repository URL");
  registerCommand.option("--project-id <string>", "project id");
  registerCommand.option("--default-branch <string>", "default branch");
  registerCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoClient().register(compact({
        name: requiredOption(options, "name"),
        slug: options.slug,
        kind: options.kind,
        localPath: options.localPath,
        remoteUrl: options.remoteUrl,
        projectId: options.projectId,
        defaultBranch: options.defaultBranch,
      }))
    );
  });

  const statusRepoCommand = command.command("status-repo");
  statusRepoCommand.description("repos statusRepo");
  statusRepoCommand.option("--json", "Emit JSON output");
  statusRepoCommand.option("--id <string>", "repository id");
  statusRepoCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoClient().statusRepo({ id: requiredOption(options, "id") })
    );
  });

  const syncCommand = command.command("sync");
  syncCommand.description("repos sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await repoClient().sync());
  });

  const syncRepoCommand = command.command("sync-repo");
  syncRepoCommand.description("repos syncRepo");
  syncRepoCommand.option("--json", "Emit JSON output");
  syncRepoCommand.option("--id <string>", "repository id");
  syncRepoCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoClient().syncRepo({ id: requiredOption(options, "id") })
    );
  });

  const unregisterCommand = command.command("unregister");
  unregisterCommand.description("repos unregister");
  unregisterCommand.option("--json", "Emit JSON output");
  unregisterCommand.option("--id <string>", "repository id");
  unregisterCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const result = await repoClient().unregister({ id: requiredOption(options, "id") });
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

function repoClient() {
  const caller = createRepositoryApiCallerFromEnv();
  if (!caller) {
    throw new Error("Repository API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.repos;
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
