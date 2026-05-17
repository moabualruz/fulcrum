import { Command, Option } from "commander";

export function createDoctorCommand(): Command {
  const command = new Command("doctor");
  command.description("Generated doctor commands.");

  const runCommand = command.command("run");
  runCommand.description("doctor run");
  runCommand.option("--json", "Emit JSON output");
  runCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doctor.run requires an explicit surface adapter.");
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

  const subsystemsCommand = command.command("subsystems");
  subsystemsCommand.description("doctor subsystems");
  subsystemsCommand.option("--json", "Emit JSON output");
  subsystemsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for doctor.subsystems requires an explicit surface adapter.");
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
