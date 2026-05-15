import { Command } from "commander";
import { createTaskCommentApiCallerFromEnv } from "@work-management/interface/http/task-comment-api-client.ts";

type JsonRecord = Record<string, unknown>;

export function createCommentsCommand(): Command {
  const command = new Command("comments");
  command.description("Generated comments commands.");

  const addReactionCommand = command.command("add-reaction");
  addReactionCommand.description("comments addReaction");
  addReactionCommand.option("--json", "Emit JSON output");
  addReactionCommand.option("--comment-id <string>", "comment-id");
  addReactionCommand.option("--emoji <string>", "emoji");
  addReactionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().addReaction({
        commentId: requiredOption(options, "commentId"),
        emoji: requiredOption(options, "emoji"),
      })
    );
  });

  const createCommand = command.command("create");
  createCommand.description("comments create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--body-json <json>", "comment body JSON");
  createCommand.option("--body-md <string>", "comment markdown");
  createCommand.option("--parent-comment-id <string>", "parent-comment-id");
  createCommand.option("--task-id <string>", "task-id");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().create(compact({
        taskId: requiredOption(options, "taskId"),
        body: commentBody(options),
        parentCommentId: options.parentCommentId,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("comments delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--comment-id <string>", "comment-id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().delete({ commentId: requiredOption(options, "commentId") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("comments list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--task-id <string>", "task-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().list({ taskId: requiredOption(options, "taskId") })
    );
  });

  const removeReactionCommand = command.command("remove-reaction");
  removeReactionCommand.description("comments removeReaction");
  removeReactionCommand.option("--json", "Emit JSON output");
  removeReactionCommand.option("--comment-id <string>", "comment-id");
  removeReactionCommand.option("--emoji <string>", "emoji");
  removeReactionCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().removeReaction({
        commentId: requiredOption(options, "commentId"),
        emoji: requiredOption(options, "emoji"),
      })
    );
  });

  const resolveCommand = command.command("resolve");
  resolveCommand.description("comments resolve");
  resolveCommand.option("--json", "Emit JSON output");
  resolveCommand.option("--comment-id <string>", "comment-id");
  resolveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().resolve({ commentId: requiredOption(options, "commentId") })
    );
  });

  const subscribeCommand = command.command("subscribe");
  subscribeCommand.description("comments subscribe");
  subscribeCommand.option("--json", "Emit JSON output");
  subscribeCommand.option("--task-id <string>", "task-id");
  subscribeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().subscribe({ taskId: requiredOption(options, "taskId") })
    );
  });

  const threadedCommand = command.command("threaded");
  threadedCommand.description("comments threaded");
  threadedCommand.option("--json", "Emit JSON output");
  threadedCommand.option("--task-id <string>", "task-id");
  threadedCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().threaded({ taskId: requiredOption(options, "taskId") })
    );
  });

  const unresolveCommand = command.command("unresolve");
  unresolveCommand.description("comments unresolve");
  unresolveCommand.option("--json", "Emit JSON output");
  unresolveCommand.option("--comment-id <string>", "comment-id");
  unresolveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().unresolve({ commentId: requiredOption(options, "commentId") })
    );
  });

  const unsubscribeCommand = command.command("unsubscribe");
  unsubscribeCommand.description("comments unsubscribe");
  unsubscribeCommand.option("--json", "Emit JSON output");
  unsubscribeCommand.option("--task-id <string>", "task-id");
  unsubscribeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().unsubscribe({ taskId: requiredOption(options, "taskId") })
    );
  });

  const watchersCommand = command.command("watchers");
  watchersCommand.description("comments watchers");
  watchersCommand.option("--json", "Emit JSON output");
  watchersCommand.option("--task-id <string>", "task-id");
  watchersCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await commentClient().watchers({ taskId: requiredOption(options, "taskId") })
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

function commentClient() {
  const caller = createTaskCommentApiCallerFromEnv();
  if (!caller) {
    throw new Error("Comment API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.comments;
}

function commentBody(options: Record<string, unknown>): JsonRecord {
  const bodyJson = options["bodyJson"];
  if (typeof bodyJson === "string" && bodyJson.trim()) {
    const parsed = JSON.parse(bodyJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
    throw new Error("bodyJson must be a JSON object.");
  }

  return { bodyMd: requiredOption(options, "bodyMd") };
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
