import { Command, Option } from "commander";

export function createInferenceCommand(): Command {
  const command = new Command("inference");
  command.description("Generated inference commands.");

  const backendsListCommand = command.command("backends list");
  backendsListCommand.description("inference backends list");
  backendsListCommand.option("--json", "Emit JSON output");
  backendsListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.backends.list is not wired yet.");
  });

  const classifyCommand = command.command("classify");
  classifyCommand.description("inference classify");
  classifyCommand.option("--json", "Emit JSON output");
  classifyCommand.option("--text <string>", "text");
  classifyCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.classify is not wired yet.");
  });

  const embedCommand = command.command("embed");
  embedCommand.description("inference embed");
  embedCommand.option("--json", "Emit JSON output");
  embedCommand.option("--model <string>", "model");
  embedCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.embed is not wired yet.");
  });

  const generateCommand = command.command("generate");
  generateCommand.description("inference generate");
  generateCommand.option("--json", "Emit JSON output");
  generateCommand.option("--prompt <string>", "prompt");
  generateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.generate is not wired yet.");
  });

  const healthCommand = command.command("health");
  healthCommand.description("inference health");
  healthCommand.option("--json", "Emit JSON output");
  healthCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.health is not wired yet.");
  });

  const modelsListCommand = command.command("models list");
  modelsListCommand.description("inference models list");
  modelsListCommand.option("--json", "Emit JSON output");
  modelsListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.models.list is not wired yet.");
  });

  const modelsPullCommand = command.command("models pull");
  modelsPullCommand.description("inference models pull");
  modelsPullCommand.option("--json", "Emit JSON output");
  modelsPullCommand.option("--force", "force");
  modelsPullCommand.option("--model-id <string>", "model-id");
  modelsPullCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.models.pull is not wired yet.");
  });

  const modelsRmCommand = command.command("models rm");
  modelsRmCommand.description("inference models rm");
  modelsRmCommand.option("--json", "Emit JSON output");
  modelsRmCommand.option("--force", "force");
  modelsRmCommand.option("--model-id <string>", "model-id");
  modelsRmCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.models.rm is not wired yet.");
  });

  const tokenizeCommand = command.command("tokenize");
  tokenizeCommand.description("inference tokenize");
  tokenizeCommand.option("--json", "Emit JSON output");
  tokenizeCommand.option("--model <string>", "model");
  tokenizeCommand.option("--text <string>", "text");
  tokenizeCommand.action(async () => {
    throw new Error("Generated tRPC invocation for inference.tokenize is not wired yet.");
  });

  return command;
}
