import { Command, Option } from "commander";
import { createRoutingApiCallerFromEnv } from "@execution-orchestration/interface/http/routing-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createRoutingCommand(): Command {
  const command = new Command("routing");
  command.description("Generated routing commands.");

  const configCommand = command.command("config");
  configCommand.description("routing config");
  const configUpdateLlmGateCommand = configCommand.command("update-llm-gate");
  configUpdateLlmGateCommand.description("routing config updateLlmGate");
  configUpdateLlmGateCommand.option("--json", "Emit JSON output");
  configUpdateLlmGateCommand.option("--enabled", "enabled");
  configUpdateLlmGateCommand.addOption(new Option("--input-mode <choice>", "input-mode").choices(["task_facts", "task_plus_history", "full_context"]));
  configUpdateLlmGateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().updateLlmGate(compact({
        enabled: booleanOption(options, "enabled"),
        inputMode: options.inputMode,
      }))
    );
  });

  const createCommand = command.command("create");
  createCommand.description("routing create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--action-agent <string>", "action-agent");
  createCommand.option("--action-skill-set <csv>", "action-skill-set");
  createCommand.option("--conditions-json <json>", "conditions-json");
  createCommand.option("--dry-run-id <string>", "dry-run-id");
  createCommand.option("--enabled", "enabled");
  createCommand.option("--name <string>", "name");
  createCommand.option("--priority <number>", "priority", Number.parseFloat);
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--task-kind <string>", "task-kind");
  createCommand.addOption(new Option("--source <choice>", "source").choices(["manual", "learned", "imported"]));
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().create(compact({
        name: requiredOption(options, "name"),
        projectId: options.projectId,
        conditionsJson: conditionsFromOptions(options),
        actionAgent: requiredOption(options, "actionAgent"),
        actionSkillSet: csvOption(options.actionSkillSet),
        priority: options.priority,
        enabled: booleanOption(options, "enabled"),
        source: options.source,
        dryRunId: options.dryRunId,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("routing delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().delete({ id: requiredOption(options, "id") })
    );
  });

  const draftsCommand = command.command("drafts");
  draftsCommand.description("routing drafts");

  const draftsApproveCommand = draftsCommand.command("approve");
  draftsApproveCommand.description("routing drafts approve");
  draftsApproveCommand.option("--json", "Emit JSON output");
  draftsApproveCommand.option("--draft-id <string>", "draft-id");
  draftsApproveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().approveDraft({ draftId: requiredOption(options, "draftId") })
    );
  });

  const draftsDeleteCommand = draftsCommand.command("delete");
  draftsDeleteCommand.description("routing drafts delete");
  draftsDeleteCommand.option("--json", "Emit JSON output");
  draftsDeleteCommand.option("--draft-id <string>", "draft-id");
  draftsDeleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().deleteDraft({ draftId: requiredOption(options, "draftId") })
    );
  });

  const draftsListCommand = draftsCommand.command("list");
  draftsListCommand.description("routing drafts list");
  draftsListCommand.option("--json", "Emit JSON output");
  draftsListCommand.option("--status <string>", "status");
  draftsListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().listDrafts(compact({ status: options.status }))
    );
  });

  const draftsUpdateCommand = draftsCommand.command("update");
  draftsUpdateCommand.description("routing drafts update");
  draftsUpdateCommand.option("--json", "Emit JSON output");
  draftsUpdateCommand.option("--action-agent <string>", "action-agent");
  draftsUpdateCommand.option("--action-skill-set <csv>", "action-skill-set");
  draftsUpdateCommand.option("--conditions-json <json>", "conditions-json");
  draftsUpdateCommand.option("--draft-id <string>", "draft-id");
  draftsUpdateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().updateDraft(compact({
        draftId: requiredOption(options, "draftId"),
        conditionsJson: parseOptionalJsonObject(options.conditionsJson, "conditionsJson"),
        actionAgent: options.actionAgent,
        actionSkillSet: csvOption(options.actionSkillSet),
      }))
    );
  });

  const dryRunCommand = command.command("dry-run");
  dryRunCommand.description("routing dryRun");
  dryRunCommand.option("--json", "Emit JSON output");
  dryRunCommand.option("--task-json-agent-override <string>", "task-json-agent-override");
  dryRunCommand.option("--task-json-kind <string>", "task-json-kind");
  dryRunCommand.option("--task-json-priority <string>", "task-json-priority");
  dryRunCommand.option("--task-json-project-id <string>", "task-json-project-id");
  dryRunCommand.option("--task-json-tags <csv>", "task-json-tags");
  dryRunCommand.option("--task-json-title <string>", "task-json-title");
  dryRunCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().dryRun({
        taskJson: compact({
          title: options.taskJsonTitle,
          kind: options.taskJsonKind,
          priority: options.taskJsonPriority,
          tags: csvOption(options.taskJsonTags),
          projectId: options.taskJsonProjectId,
          agentOverride: options.taskJsonAgentOverride,
        }),
      })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("routing get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("routing list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().list(compact({ projectId: options.projectId }))
    );
  });

  const testCommand = command.command("test");
  testCommand.description("routing test");
  testCommand.option("--json", "Emit JSON output");
  testCommand.option("--task-id <string>", "task-id");
  testCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().test({ taskId: requiredOption(options, "taskId") })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("routing update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--action-agent <string>", "action-agent");
  updateCommand.option("--action-skill-set <csv>", "action-skill-set");
  updateCommand.option("--conditions-json <json>", "conditions-json");
  updateCommand.option("--dry-run-id <string>", "dry-run-id");
  updateCommand.option("--enabled", "enabled");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--name <string>", "name");
  updateCommand.option("--priority <number>", "priority", Number.parseFloat);
  updateCommand.option("--project-id <string>", "project-id");
  updateCommand.addOption(new Option("--source <choice>", "source").choices(["manual", "learned", "imported"]));
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await routingClient().update(compact({
        id: requiredOption(options, "id"),
        projectId: options.projectId,
        name: options.name,
        conditionsJson: parseOptionalJsonObject(options.conditionsJson, "conditionsJson"),
        actionAgent: options.actionAgent,
        actionSkillSet: csvOption(options.actionSkillSet),
        priority: options.priority,
        enabled: booleanOption(options, "enabled"),
        source: options.source,
        dryRunId: options.dryRunId,
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

function routingClient() {
  const caller = createRoutingApiCallerFromEnv();
  if (!caller) {
    throw new Error("Routing API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.routing;
}

function conditionsFromOptions(options: Record<string, unknown>): JsonRecord {
  const parsed = parseOptionalJsonObject(options.conditionsJson, "conditionsJson");
  if (parsed) return parsed;
  return {
    all: [{ fact: "task", path: "$.kind", operator: "equal", value: requiredOption(options, "taskKind") }],
  };
}

function parseOptionalJsonObject(value: unknown, name: string): JsonRecord | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
  throw new Error(`${name} must be a JSON object.`);
}

function csvOption(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function booleanOption(options: Record<string, unknown>, key: string): true | undefined {
  return options[key] === true ? true : undefined;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}
