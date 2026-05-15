import { Command } from "commander";

import { createSubscriptionEventApiCallerFromEnv } from "@platform-core/interface/http/subscription-event-api-client.ts";

export function createOrchestrationSubscriptionsCommand(): Command {
  const command = new Command("orchestrationSubscriptions");
  command.description("Generated orchestrationSubscriptions commands.");

  const onStateChangeCommand = command.command("on-state-change");
  onStateChangeCommand.description("orchestrationSubscriptions onStateChange");
  onStateChangeCommand.option("--json", "Emit JSON output");
  onStateChangeCommand.option("--watch", "Stream subscription events as JSON lines");
  onStateChangeCommand.action(async (options) => {
    try {
      if (options.watch === true) {
        await subscriptionClient().orchestrationSubscriptions.onStateChange({
          signal: abortSignalFromInterrupt(),
          onEvent: (event) => console.log(JSON.stringify(event)),
        });
        return;
      }
      throw new Error("orchestrationSubscriptions.onStateChange is a stream. Use --watch to consume JSON-line events.");
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
