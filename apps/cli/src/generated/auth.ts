import { Command, Option } from "commander";

import { createAuthApiCallerFromEnv } from "@identity-access/interface/http/auth-api-client.ts";

export function createAuthCommand(): Command {
  const command = new Command("auth");
  command.description("Generated auth commands.");

  const acceptInviteCommand = command.command("accept-invite");
  acceptInviteCommand.description("auth acceptInvite");
  acceptInviteCommand.option("--json", "Emit JSON output");
  acceptInviteCommand.option("--token <string>", "Plaintext token from the invitation email.");
  acceptInviteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await authClient().acceptInvite({ token: requiredOption(options, "token") })
    );
  });

  const inviteCommand = command.command("invite");
  inviteCommand.description("auth invite");
  inviteCommand.option("--json", "Emit JSON output");
  inviteCommand.option("--email <string>", "Email address of the person to invite.");
  inviteCommand.addOption(new Option("--role <choice>", "Role to assign to the invited user.").choices(["owner","admin","member","guest"]));
  inviteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await authClient().invite({
        email: requiredOption(options, "email"),
        role: options.role ?? "member",
      })
    );
  });

  const whoamiCommand = command.command("whoami");
  whoamiCommand.description("auth whoami");
  whoamiCommand.option("--json", "Emit JSON output");
  whoamiCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await authClient().whoami());
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

function authClient() {
  const caller = createAuthApiCallerFromEnv();
  if (!caller) {
    throw new Error("Auth API caller is not configured. Set FULCRUM_SERVER_URL.");
  }
  return caller.auth;
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
