import { Command } from "commander";
import { createCredentialApiCallerFromEnv } from "@platform-core/interface/http/credential-api-client.ts";

export function createCredentialsCommand(): Command {
  const command = new Command("credentials");
  command.description("Generated credentials commands.");

  const archiveCommand = command.command("archive");
  archiveCommand.description("credentials archive");
  archiveCommand.option("--json", "Emit JSON output");
  archiveCommand.option("--name <string>", "name");
  archiveCommand.option("--user-id <string>", "user-id");
  archiveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await credentialClient().archive({
        name: requiredOption(options, "name"),
        targetUserId: options.userId,
      })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("credentials get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--name <string>", "name");
  getCommand.option("--user-id <string>", "user-id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await credentialClient().get({
        name: requiredOption(options, "name"),
        targetUserId: options.userId,
      })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("credentials list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-archived", "include-archived");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await credentialClient().list({ includeArchived: options.includeArchived === true ? true : undefined })
    );
  });

  const removeCommand = command.command("remove");
  removeCommand.description("credentials remove");
  removeCommand.option("--json", "Emit JSON output");
  removeCommand.option("--name <string>", "name");
  removeCommand.option("--user-id <string>", "user-id");
  removeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await credentialClient().remove({
        name: requiredOption(options, "name"),
        targetUserId: options.userId,
      })
    );
  });

  const rotateCommand = command.command("rotate");
  rotateCommand.description("credentials rotate");
  rotateCommand.option("--json", "Emit JSON output");
  rotateCommand.option("--name <string>", "name");
  rotateCommand.option("--new-value <string>", "new-value");
  rotateCommand.option("--user-id <string>", "user-id");
  rotateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await credentialClient().rotate({
        name: requiredOption(options, "name"),
        newValue: requiredOption(options, "newValue"),
        targetUserId: options.userId,
      })
    );
  });

  const setCommand = command.command("set");
  setCommand.description("credentials set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--name <string>", "name");
  setCommand.option("--value <string>", "value");
  setCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await credentialClient().set({
        name: requiredOption(options, "name"),
        value: requiredOption(options, "value"),
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

function credentialClient() {
  const caller = createCredentialApiCallerFromEnv();
  if (!caller) {
    throw new Error("Credential API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.credentials;
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
