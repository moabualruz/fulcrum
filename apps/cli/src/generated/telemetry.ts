import { Command, Option } from "commander";

export function createTelemetryCommand(): Command {
  const command = new Command("telemetry");
  command.description("Generated telemetry commands.");

  const optInCommand = command.command("opt-in");
  optInCommand.description("telemetry optIn");
  optInCommand.option("--json", "Emit JSON output");
  optInCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for telemetry.optIn requires an explicit surface adapter.");
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

  const optOutCommand = command.command("opt-out");
  optOutCommand.description("telemetry optOut");
  optOutCommand.option("--json", "Emit JSON output");
  optOutCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for telemetry.optOut requires an explicit surface adapter.");
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

  const purgeCommand = command.command("purge");
  purgeCommand.description("telemetry purge");
  purgeCommand.option("--json", "Emit JSON output");
  purgeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for telemetry.purge requires an explicit surface adapter.");
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
  statusCommand.description("telemetry status");
  statusCommand.option("--json", "Emit JSON output");
  statusCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for telemetry.status requires an explicit surface adapter.");
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
