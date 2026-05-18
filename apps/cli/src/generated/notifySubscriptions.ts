import { Command, Option } from "commander";
import { runGeneratedSubscriptionWatch } from "./subscriptionWatch.ts";

export function createNotifySubscriptionsCommand(): Command {
  const command = new Command("notifySubscriptions");
  command.description("Generated notifySubscriptions commands.");

  const onNewNotificationCommand = command.command("on-new-notification");
  onNewNotificationCommand.description("notifySubscriptions onNewNotification");
  onNewNotificationCommand.option("--json", "Emit JSON output");
  onNewNotificationCommand.option("--watch", "Stream subscription events as JSON lines");
  onNewNotificationCommand.action(async (options) => {
    try {
      if (options.watch === true) {
        await runGeneratedSubscriptionWatch({ procedurePath: "notifySubscriptions.onNewNotification" });
        return;
      }
      throw new Error("Generated tRPC invocation for notifySubscriptions.onNewNotification requires an explicit surface adapter.");
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
