import { Command, Option } from "commander";

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

  const statusCommand = command.command("status");
  statusCommand.description("notifySubscriptions status");
  statusCommand.option("--json", "Emit JSON output");
  statusCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifySubscriptions.status requires an explicit surface adapter.");
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

async function runGeneratedSubscriptionWatch(options: { procedurePath: string }): Promise<void> {
  const shutdown = new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
  });
  await Promise.race([
    shutdown,
    Promise.reject(new Error(`Generated tRPC subscription for ${options.procedurePath} requires an explicit surface adapter.`)),
  ]);
}
