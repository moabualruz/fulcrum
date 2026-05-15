import { Command, Option } from "commander";
import { createOrganizationApiCallerFromEnv } from "@identity-access/interface/http/organization-api-client.ts";

export function createOrgsCommand(): Command {
  const command = new Command("orgs");
  command.description("Generated orgs commands.");

  const getCommand = command.command("get");
  getCommand.description("orgs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await orgClient().get());
  });

  const membersCommand = command.command("members");
  membersCommand.description("orgs members");

  const membersListCommand = membersCommand.command("list");
  membersListCommand.description("orgs members list");
  membersListCommand.option("--json", "Emit JSON output");
  membersListCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await orgClient().members.list());
  });

  const membersRemoveCommand = membersCommand.command("remove");
  membersRemoveCommand.description("orgs members remove");
  membersRemoveCommand.option("--json", "Emit JSON output");
  membersRemoveCommand.option("--user-id <string>", "User to remove from the organisation.");
  membersRemoveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await orgClient().members.remove({ userId: requiredOption(options, "userId") })
    );
  });

  const membersUpdateRoleCommand = membersCommand.command("update-role");
  membersUpdateRoleCommand.description("orgs members updateRole");
  membersUpdateRoleCommand.option("--json", "Emit JSON output");
  membersUpdateRoleCommand.addOption(new Option("--role <choice>", "New role to assign to the member.").choices(["owner", "admin", "member", "guest"]));
  membersUpdateRoleCommand.option("--user-id <string>", "User whose role should be updated.");
  membersUpdateRoleCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await orgClient().members.updateRole({
        userId: requiredOption(options, "userId"),
        role: requiredOption(options, "role"),
      })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("orgs update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--name <string>", "New human-readable organisation name.");
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await orgClient().update({ name: requiredOption(options, "name") })
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

function orgClient() {
  const caller = createOrganizationApiCallerFromEnv();
  if (!caller) {
    throw new Error("Organization API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.orgs;
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
