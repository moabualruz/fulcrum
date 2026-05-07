import { Command, Option } from "commander";

export function createInferenceCommand(): Command {
  const command = new Command("inference");
  command.description("Generated inference commands.");

  const backendsListCommand = command.command("backends list");
  backendsListCommand.description("inference backends list");
  backendsListCommand.option("--json", "Emit JSON output");
  backendsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.backends.list requires an explicit surface adapter.");
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

  const backendsProbeCommand = command.command("backends probe");
  backendsProbeCommand.description("inference backends probe");
  backendsProbeCommand.option("--json", "Emit JSON output");
  backendsProbeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.backends.probe requires an explicit surface adapter.");
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

  const classifyCommand = command.command("classify");
  classifyCommand.description("inference classify");
  classifyCommand.option("--json", "Emit JSON output");
  classifyCommand.option("--text <string>", "text");
  classifyCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.classify requires an explicit surface adapter.");
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

  const configGetCommand = command.command("config get");
  configGetCommand.description("inference config get");
  configGetCommand.option("--json", "Emit JSON output");
  configGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.config.get requires an explicit surface adapter.");
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

  const configSetCommand = command.command("config set");
  configSetCommand.description("inference config set");
  configSetCommand.option("--json", "Emit JSON output");
  configSetCommand.addOption(new Option("--feature <choice>", "feature").choices(["embeddings","router-llm","memory-llm-extract","classify","tokenize"]));
  configSetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.config.set requires an explicit surface adapter.");
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

  const embedCommand = command.command("embed");
  embedCommand.description("inference embed");
  embedCommand.option("--json", "Emit JSON output");
  embedCommand.option("--model <string>", "model");
  embedCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.embed requires an explicit surface adapter.");
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

  const generateCommand = command.command("generate");
  generateCommand.description("inference generate");
  generateCommand.option("--json", "Emit JSON output");
  generateCommand.option("--options-max-tokens <number>", "options-max-tokens", Number.parseFloat);
  generateCommand.option("--options-model <string>", "options-model");
  generateCommand.option("--options-temperature <number>", "options-temperature", Number.parseFloat);
  generateCommand.option("--prompt <string>", "prompt");
  generateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.generate requires an explicit surface adapter.");
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

  const healthCommand = command.command("health");
  healthCommand.description("inference health");
  healthCommand.option("--json", "Emit JSON output");
  healthCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.health requires an explicit surface adapter.");
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

  const modelsListCommand = command.command("models list");
  modelsListCommand.description("inference models list");
  modelsListCommand.option("--json", "Emit JSON output");
  modelsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.models.list requires an explicit surface adapter.");
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

  const modelsPullCommand = command.command("models pull");
  modelsPullCommand.description("inference models pull");
  modelsPullCommand.option("--json", "Emit JSON output");
  modelsPullCommand.option("--watch", "Stream subscription events as JSON lines");
  modelsPullCommand.option("--force", "force");
  modelsPullCommand.option("--model-id <string>", "model-id");
  modelsPullCommand.action(async (options) => {
    try {
      if (options.watch === true) {
        await runGeneratedSubscriptionWatch({ procedurePath: "inference.models.pull" });
        return;
      }
      throw new Error("Generated tRPC invocation for inference.models.pull requires an explicit surface adapter.");
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

  const modelsRmCommand = command.command("models rm");
  modelsRmCommand.description("inference models rm");
  modelsRmCommand.option("--json", "Emit JSON output");
  modelsRmCommand.option("--force", "force");
  modelsRmCommand.option("--model-id <string>", "model-id");
  modelsRmCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.models.rm requires an explicit surface adapter.");
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

  const providerSetCommand = command.command("provider set");
  providerSetCommand.description("inference provider set");
  providerSetCommand.option("--json", "Emit JSON output");
  providerSetCommand.option("--key <string>", "key");
  providerSetCommand.option("--url <string>", "url");
  providerSetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.provider.set requires an explicit surface adapter.");
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

  const providerTestCommand = command.command("provider test");
  providerTestCommand.description("inference provider test");
  providerTestCommand.option("--json", "Emit JSON output");
  providerTestCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.provider.test requires an explicit surface adapter.");
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

  const tokenizeCommand = command.command("tokenize");
  tokenizeCommand.description("inference tokenize");
  tokenizeCommand.option("--json", "Emit JSON output");
  tokenizeCommand.option("--model <string>", "model");
  tokenizeCommand.option("--text <string>", "text");
  tokenizeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for inference.tokenize requires an explicit surface adapter.");
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
