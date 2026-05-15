import { Command, Option } from "commander";
import { createAgentRunApiCallerFromEnv } from "@execution-orchestration/interface/http/agent-run-api-client.ts";

export function createAgentRunsCommand(): Command {
  const command = new Command("agent_runs");
  command.description("Generated agent_runs commands.");

  const cancelCommand = command.command("cancel");
  cancelCommand.description("agent_runs cancel");
  cancelCommand.option("--json", "Emit JSON output");
  cancelCommand.option("--id <string>", "id");
  cancelCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await agentRunClient().cancel({ id: requiredOption(options, "id") })
    );
  });

  const createCommand = command.command("create");
  createCommand.description("agent_runs create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--project-id <string>", "project id");
  createCommand.option("--task-id <string>", "task id");
  createCommand.option("--agent <string>", "agent");
  createCommand.option("--agent-name <string>", "agent name");
  createCommand.option("--trace-id <string>", "trace id");
  createCommand.option("--dependency-tree <items>", "comma-separated dependency task ids");
  createCommand.option("--dependency-tree-json <json>", "dependency task ids JSON array");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await agentRunClient().create(compact({
        projectId: options.projectId,
        taskId: options.taskId,
        agent: options.agent,
        agentName: options.agentName,
        traceId: options.traceId,
        dependencyTree: dependencyTreeOption(options),
      }))
    );
  });

  const getCommand = command.command("get");
  getCommand.description("agent_runs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await agentRunClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("agent_runs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--status <string>", "status");
  listCommand.addOption(new Option("--limit <number>", "limit").argParser(Number.parseInt));
  listCommand.addOption(new Option("--offset <number>", "offset").argParser(Number.parseInt));
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await agentRunClient().list(compact({
        status: options.status,
        limit: options.limit,
        offset: options.offset,
      }))
    );
  });

  const retryCommand = command.command("retry");
  retryCommand.description("agent_runs retry");
  retryCommand.option("--json", "Emit JSON output");
  retryCommand.option("--id <string>", "id");
  retryCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await agentRunClient().retry({ id: requiredOption(options, "id") })
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

function agentRunClient() {
  const caller = createAgentRunApiCallerFromEnv();
  if (!caller) {
    throw new Error("Agent-run API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.agent_runs;
}

function dependencyTreeOption(options: Record<string, unknown>): string[] | undefined {
  const json = options["dependencyTreeJson"];
  if (typeof json === "string" && json.trim()) {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("dependencyTreeJson must be a JSON string array.");
    }
    return parsed;
  }

  const value = options["dependencyTree"];
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
