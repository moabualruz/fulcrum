import { Command, Option } from "commander";

import { createInvitationApiCallerFromEnv } from "@identity-access/interface/http/invitation-api-client.ts";

const INVITATION_ROLES = ["owner", "admin", "member", "guest"] as const;

export function createInvitationsCommand(): Command {
  const command = new Command("invitations");
  command.description("Generated invitations commands.");

  const createCommand = command.command("create");
  createCommand.description("invitations create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--email <string>", "Invitation email address.");
  createCommand.addOption(new Option("--role <choice>", "Invitation role.").choices([...INVITATION_ROLES]).default("member"));
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await invitationsClient().create({
        email: requiredOption(options, "email"),
        role: options.role,
      })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("invitations get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await invitationsClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("invitations list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await invitationsClient().list());
  });

  const revokeCommand = command.command("revoke");
  revokeCommand.description("invitations revoke");
  revokeCommand.option("--json", "Emit JSON output");
  revokeCommand.option("--id <string>", "id");
  revokeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await invitationsClient().revoke({ id: requiredOption(options, "id") })
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

function invitationsClient() {
  const caller = createInvitationApiCallerFromEnv();
  if (!caller) {
    throw new Error("Invitation API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.invitations;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
