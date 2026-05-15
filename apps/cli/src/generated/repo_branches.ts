import { Command } from "commander";

import { createRepositoryApiCallerFromEnv } from "@integration-hub/interface/http/repository-api-client.ts";

export function createRepoBranchesCommand(): Command {
  const command = new Command("repo_branches");
  command.description("Generated repo_branches commands.");

  const getCommand = command.command("get");
  getCommand.description("repo_branches get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoBranchClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("repo_branches list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--repo-id <string>", "repository id");
  listCommand.option("--limit <number>", "maximum branches to return");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await repoBranchClient().list(compact({
        repoId: options.repoId,
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

function repoBranchClient() {
  const caller = createRepositoryApiCallerFromEnv();
  if (!caller) {
    throw new Error("Repository API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.repoBranches;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && value !== ""
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
