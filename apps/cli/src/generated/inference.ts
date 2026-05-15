import { Command, Option } from "commander";
import { createInferenceApiCallerFromEnv } from "@platform-core/interface/http/inference-api-client.ts";

type CliOptions = Record<string, unknown> & { json?: boolean };

export function createInferenceCommand(): Command {
  const command = new Command("inference");
  command.description("Generated inference commands.");

  const backendsCommand = command.command("backends");
  backendsCommand.description("Generated inference backend commands.");

  const backendsListCommand = backendsCommand.command("list");
  backendsListCommand.description("inference backends list");
  backendsListCommand.option("--json", "Emit JSON output");
  backendsListCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () => await inferenceClient().backends.list());
  });

  const backendsProbeCommand = backendsCommand.command("probe");
  backendsProbeCommand.description("inference backends probe");
  backendsProbeCommand.option("--json", "Emit JSON output");
  backendsProbeCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () => await inferenceClient().backends.probe());
  });

  const classifyCommand = command.command("classify");
  classifyCommand.description("inference classify");
  classifyCommand.option("--json", "Emit JSON output");
  classifyCommand.option("--text <string>", "text");
  classifyCommand.option("--labels <csv>", "Comma-separated labels");
  classifyCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().classify({
        text: requiredOption(options, "text"),
        labels: csvOption(options, "labels"),
      })
    );
  });

  const configCommand = command.command("config");
  configCommand.description("Generated inference configuration commands.");

  const configGetCommand = configCommand.command("get");
  configGetCommand.description("inference config get");
  configGetCommand.option("--json", "Emit JSON output");
  configGetCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () => await inferenceClient().config.get());
  });

  const configSetCommand = configCommand.command("set");
  configSetCommand.description("inference config set");
  configSetCommand.option("--json", "Emit JSON output");
  configSetCommand.addOption(new Option("--feature <choice>", "feature").choices(["embeddings","router-llm","memory-llm-extract","classify","tokenize"]));
  configSetCommand.addOption(new Option("--backend <choice>", "backend").choices(["embedded","ollama","lm-studio","openai-compatible"]));
  configSetCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().config.set({
        feature: requiredOption(options, "feature"),
        backend: requiredOption(options, "backend"),
      })
    );
  });

  const embedCommand = command.command("embed");
  embedCommand.description("inference embed");
  embedCommand.option("--json", "Emit JSON output");
  embedCommand.option("--text <string>", "Text to embed");
  embedCommand.option("--model <string>", "model");
  embedCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().embed(compact({
        texts: [requiredOption(options, "text")],
        model: options.model,
      }) as { texts: string[]; model?: string })
    );
  });

  const generateCommand = command.command("generate");
  generateCommand.description("inference generate");
  generateCommand.option("--json", "Emit JSON output");
  generateCommand.option("--options-max-tokens <number>", "options-max-tokens", Number.parseFloat);
  generateCommand.option("--options-model <string>", "options-model");
  generateCommand.option("--options-temperature <number>", "options-temperature", Number.parseFloat);
  generateCommand.option("--prompt <string>", "prompt");
  generateCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().generate({
        prompt: requiredOption(options, "prompt"),
        options: compact({
          maxTokens: options.optionsMaxTokens,
          model: options.optionsModel,
          temperature: options.optionsTemperature,
        }),
      })
    );
  });

  const healthCommand = command.command("health");
  healthCommand.description("inference health");
  healthCommand.option("--json", "Emit JSON output");
  healthCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () => await inferenceClient().health());
  });

  const modelsCommand = command.command("models");
  modelsCommand.description("Generated inference model commands.");

  const modelsListCommand = modelsCommand.command("list");
  modelsListCommand.description("inference models list");
  modelsListCommand.option("--json", "Emit JSON output");
  modelsListCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () => await inferenceClient().models.list());
  });

  const modelsPullCommand = modelsCommand.command("pull");
  modelsPullCommand.description("inference models pull");
  modelsPullCommand.option("--json", "Emit JSON output");
  modelsPullCommand.option("--watch", "Stream model-pull events as JSON lines");
  modelsPullCommand.option("--force", "force");
  modelsPullCommand.option("--model-id <string>", "model-id");
  modelsPullCommand.action(async (options: CliOptions & { watch?: boolean; force?: boolean }) => {
    await runGeneratedAction(options, async () => {
      const result = await inferenceClient().models.pull({
        modelId: requiredOption(options, "modelId"),
        force: options.force === true,
      });
      if (options.watch === true && Array.isArray(result)) {
        for (const event of result) console.log(JSON.stringify(event));
        return undefined;
      }
      return result;
    });
  });

  const modelsRmCommand = modelsCommand.command("rm");
  modelsRmCommand.description("inference models rm");
  modelsRmCommand.option("--json", "Emit JSON output");
  modelsRmCommand.option("--model-id <string>", "model-id");
  modelsRmCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().models.rm({ modelId: requiredOption(options, "modelId") })
    );
  });

  const providerCommand = command.command("provider");
  providerCommand.description("Generated inference provider commands.");

  const providerSetCommand = providerCommand.command("set");
  providerSetCommand.description("inference provider set");
  providerSetCommand.option("--json", "Emit JSON output");
  providerSetCommand.option("--key <string>", "key");
  providerSetCommand.option("--url <string>", "url");
  providerSetCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().provider.set({
        key: requiredOption(options, "key"),
        url: requiredOption(options, "url"),
      })
    );
  });

  const providerTestCommand = providerCommand.command("test");
  providerTestCommand.description("inference provider test");
  providerTestCommand.option("--json", "Emit JSON output");
  providerTestCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () => await inferenceClient().provider.test());
  });

  const tokenizeCommand = command.command("tokenize");
  tokenizeCommand.description("inference tokenize");
  tokenizeCommand.option("--json", "Emit JSON output");
  tokenizeCommand.option("--model <string>", "model");
  tokenizeCommand.option("--text <string>", "text");
  tokenizeCommand.action(async (options: CliOptions) => {
    await runGeneratedAction(options, async () =>
      await inferenceClient().tokenize(compact({
        model: options.model,
        text: requiredOption(options, "text"),
      }) as { text: string; model?: string })
    );
  });

  return command;
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    const result = await action();
    if (result !== undefined) printGeneratedResult(result, options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function inferenceClient() {
  const caller = createInferenceApiCallerFromEnv();
  if (!caller) {
    throw new Error("Inference API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.inference;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) {
    console.log(JSON.stringify(result));
    return;
  }
  if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function csvOption(options: Record<string, unknown>, key: string): string[] {
  const value = requiredOption(options, key);
  const labels = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (labels.length === 0) throw new Error(`${key} must include at least one value.`);
  return labels;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
