import { Command } from "commander";

import { createMemoryApiCallerFromEnv } from "@knowledge-workspace/interface/http/memory-api-client.ts";

export function createContextCommand(): Command {
  const command = new Command("context");
  command.description("Generated context commands.");

  const assembleCommand = command.command("assemble");
  assembleCommand.description("context assemble");
  assembleCommand.option("--json", "Emit JSON output");
  assembleCommand.option("--task-id <string>", "task-id");
  assembleCommand.option("--task <string>", "task");
  assembleCommand.option("--budget <number>", "token budget", Number.parseFloat);
  assembleCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await contextClient().preview(compact({
        taskId: taskIdentifier(options),
        budget: options.budget,
      }))
    );
  });

  const previewCommand = command.command("preview");
  previewCommand.description("context preview");
  previewCommand.option("--json", "Emit JSON output");
  previewCommand.option("--task-id <string>", "task-id");
  previewCommand.option("--task <string>", "task");
  previewCommand.option("--budget <number>", "token budget", Number.parseFloat);
  previewCommand.option("--include-global", "include-global");
  previewCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await contextClient().preview(compact({
        taskId: taskIdentifier(options),
        budget: options.budget,
        includeGlobal: options.includeGlobal === true ? true : undefined,
      }))
    );
  });

  return command;
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
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

function contextClient() {
  const caller = createMemoryApiCallerFromEnv();
  if (!caller) {
    throw new Error("Context API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_API_TOKEN or FULCRUM_PUBLIC_API_TOKEN.");
  }
  return caller.context;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && value !== ""
    ),
  );
}

function taskIdentifier(options: Record<string, unknown>): string {
  const value = options["taskId"] ?? options["task"];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error("taskId is required.");
}
