import { Command } from "commander";

import { createSubscriptionEventApiCallerFromEnv } from "@platform-core/interface/http/subscription-event-api-client.ts";

export function createRunsSubscriptionsCommand(): Command {
  const command = new Command("runsSubscriptions");
  command.description("Generated runsSubscriptions commands.");

  const onRunUpdateCommand = command.command("on-run-update");
  onRunUpdateCommand.description("runsSubscriptions onRunUpdate");
  onRunUpdateCommand.option("--json", "Emit JSON output");
  onRunUpdateCommand.option("--watch", "Stream subscription events as JSON lines");
  onRunUpdateCommand.option("--run-id <string>", "run-id");
  onRunUpdateCommand.action(async (options) => {
    try {
      if (options.watch === true) {
        await subscriptionClient().runsSubscriptions.onRunUpdate({
          runId: requiredOption(options, "runId"),
          signal: abortSignalFromInterrupt(),
          onEvent: (event) => console.log(JSON.stringify(event)),
        });
        return;
      }
      throw new Error("runsSubscriptions.onRunUpdate is a stream. Use --watch to consume JSON-line events.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}

function subscriptionClient() {
  const caller = createSubscriptionEventApiCallerFromEnv();
  if (!caller) {
    throw new Error("Subscription event API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller;
}

function abortSignalFromInterrupt(): AbortSignal {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  return controller.signal;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
