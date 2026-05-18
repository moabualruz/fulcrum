import { Command, Option } from "commander";
import { runGeneratedSubscriptionWatch } from "./subscriptionWatch.ts";

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
        await runGeneratedSubscriptionWatch({
          procedurePath: "runsSubscriptions.onRunUpdate",
          args: { runId: options.runId },
        });
        return;
      }
      throw new Error("Generated tRPC invocation for runsSubscriptions.onRunUpdate requires an explicit surface adapter.");
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
