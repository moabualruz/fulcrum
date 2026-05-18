import { Command, Option } from "commander";
import { runGeneratedSubscriptionWatch } from "./subscriptionWatch.ts";

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
        await runGeneratedSubscriptionWatch({ procedurePath: "orchestrationSubscriptions.onStateChange" });
        return;
      }
      throw new Error("Generated tRPC invocation for orchestrationSubscriptions.onStateChange requires an explicit surface adapter.");
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
