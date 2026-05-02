import { Command, Option } from "commander";

export function createDoctorCommand(): Command {
  const command = new Command("doctor");
  command.description("Generated doctor commands.");

  const runCommand = command.command("run");
  runCommand.description("doctor run");
  runCommand.option("--json", "Emit JSON output");
  runCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doctor.run is not wired yet.");
  });

  const subsystemsCommand = command.command("subsystems");
  subsystemsCommand.description("doctor subsystems");
  subsystemsCommand.option("--json", "Emit JSON output");
  subsystemsCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doctor.subsystems is not wired yet.");
  });

  return command;
}
