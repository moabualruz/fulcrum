import { Command, Option } from "commander";

export function createContextCommand(): Command {
  const command = new Command("context");
  command.description("Generated context commands.");

  const assembleCommand = command.command("assemble");
  assembleCommand.description("context assemble");
  assembleCommand.option("--json", "Emit JSON output");
  assembleCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for context.assemble is not wired yet.");
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

  const previewCommand = command.command("preview");
  previewCommand.description("context preview");
  previewCommand.option("--json", "Emit JSON output");
  previewCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for context.preview is not wired yet.");
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
