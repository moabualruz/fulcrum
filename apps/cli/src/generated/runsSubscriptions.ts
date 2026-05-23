import { Command, Option } from "commander";

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
        await runGeneratedSubscriptionWatch({ procedurePath: "runsSubscriptions.onRunUpdate" });
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

  const statusCommand = command.command("status");
  statusCommand.description("runsSubscriptions status");
  statusCommand.option("--json", "Emit JSON output");
  statusCommand.option("--run-id <string>", "run-id");
  statusCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for runsSubscriptions.status requires an explicit surface adapter.");
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
