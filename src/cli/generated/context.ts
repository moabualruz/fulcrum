import { Command, Option } from "commander";

export function createContextCommand(): Command {
  const command = new Command("context");
  command.description("Generated context commands.");

  const assembleCommand = command.command("assemble");
  assembleCommand.description("context assemble");
  assembleCommand.option("--json", "Emit JSON output");
  assembleCommand.action(async () => {
    throw new Error("Generated tRPC invocation for context.assemble is not wired yet.");
  });

  const previewCommand = command.command("preview");
  previewCommand.description("context preview");
  previewCommand.option("--json", "Emit JSON output");
  previewCommand.action(async () => {
    throw new Error("Generated tRPC invocation for context.preview is not wired yet.");
  });

  return command;
}
