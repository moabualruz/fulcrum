import { Command, Option } from "commander";
import { createSprintApiCallerFromEnv } from "@work-management/interface/http/sprint-api-client.ts";

export function createSprintsCommand(): Command {
  const command = new Command("sprints");
  command.description("Generated sprints commands.");

  const addTaskCommand = command.command("add-task");
  addTaskCommand.description("sprints addTask");
  addTaskCommand.option("--json", "Emit JSON output");
  addTaskCommand.option("--id <string>", "sprint id");
  addTaskCommand.option("--task-id <string>", "task id");
  addTaskCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().addTask({
        id: requiredOption(options, "id"),
        taskId: requiredOption(options, "taskId"),
      })
    );
  });

  const closeCommand = command.command("close");
  closeCommand.description("sprints close");
  closeCommand.option("--json", "Emit JSON output");
  closeCommand.option("--id <string>", "sprint id");
  closeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().update({ id: requiredOption(options, "id"), status: "completed" })
    );
  });

  const createCommand = command.command("create");
  createCommand.description("sprints create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--project-id <string>", "project id");
  createCommand.option("--name <string>", "sprint name");
  createCommand.addOption(sprintStatusOption());
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().create(compact({
        projectId: options.projectId,
        name: requiredOption(options, "name"),
        status: options.status,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("sprints delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "sprint id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const result = await sprintClient().delete({ id: requiredOption(options, "id") });
      return result ?? { ok: true };
    });
  });

  const getCommand = command.command("get");
  getCommand.description("sprints get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "sprint id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("sprints list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project id");
  listCommand.addOption(sprintStatusOption());
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().list(compact({
        projectId: options.projectId,
        status: options.status,
      }))
    );
  });

  const removeTaskCommand = command.command("remove-task");
  removeTaskCommand.description("sprints removeTask");
  removeTaskCommand.option("--json", "Emit JSON output");
  removeTaskCommand.option("--id <string>", "sprint id");
  removeTaskCommand.option("--task-id <string>", "task id");
  removeTaskCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const result = await sprintClient().removeTask({
        id: requiredOption(options, "id"),
        taskId: requiredOption(options, "taskId"),
      });
      return result ?? { ok: true };
    });
  });

  const startCommand = command.command("start");
  startCommand.description("sprints start");
  startCommand.option("--json", "Emit JSON output");
  startCommand.option("--id <string>", "sprint id");
  startCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().update({ id: requiredOption(options, "id"), status: "active" })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("sprints update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "sprint id");
  updateCommand.option("--name <string>", "sprint name");
  updateCommand.addOption(sprintStatusOption());
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await sprintClient().update({
        id: requiredOption(options, "id"),
        ...compact({
          name: options.name,
          status: options.status,
        }),
      })
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

function sprintClient() {
  const caller = createSprintApiCallerFromEnv();
  if (!caller) {
    throw new Error("Sprint API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.sprints;
}

function sprintStatusOption(): Option {
  return new Option("--status <choice>", "status").choices(["planning", "active", "completed", "cancelled"]);
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
