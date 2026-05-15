import { Command } from "commander";

export function createHealthCommand(): Command {
  const command = new Command("health");
  command.description("Generated health commands.");

  const pingCommand = command.command("ping");
  pingCommand.description("health ping");
  pingCommand.option("--json", "Emit JSON output");
  pingCommand.action(async (options) => {
    printOutput({ ok: true, timestamp: new Date().toISOString() }, options.json === true);
  });

  return command;
}

function printOutput(value: unknown, json: boolean): void {
  console.log(json ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}
