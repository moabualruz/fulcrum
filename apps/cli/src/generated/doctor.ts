import { Command } from "commander";
import { buildDoctorReport, discoverChecks } from "@platform-core/application/health-checks/index.ts";

export function createDoctorCommand(): Command {
  const command = new Command("doctor");
  command.description("Generated doctor commands.");

  const runCommand = command.command("run");
  runCommand.description("doctor run");
  runCommand.option("--json", "Emit JSON output");
  runCommand.action(async (options) => {
    printOutput(await buildDoctorReport(), options.json === true);
  });

  const subsystemsCommand = command.command("subsystems");
  subsystemsCommand.description("doctor subsystems");
  subsystemsCommand.option("--json", "Emit JSON output");
  subsystemsCommand.action(async (options) => {
    const checks = await discoverChecks();
    const subsystems = [...new Set(checks.map((check) => check.subsystem))].sort();
    printOutput(subsystems, options.json === true);
  });

  return command;
}

function printOutput(value: unknown, json: boolean): void {
  console.log(json ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}
