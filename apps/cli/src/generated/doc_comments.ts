import { Command } from "commander";

import { createDocumentApiCallerFromEnv } from "@knowledge-workspace/interface/http/document-api-client.ts";

export function createDocCommentsCommand(): Command {
  const command = new Command("doc_comments");
  command.description("Generated doc_comments commands.");

  const createCommand = command.command("create");
  createCommand.description("doc_comments create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--body-md <string>", "body-md");
  createCommand.option("--doc-id <string>", "doc-id");
  createCommand.option("--author-id <string>", "author-id");
  createCommand.option("--parent-comment-id <string>", "parent-comment-id");
  createCommand.option("--selection-json <json>", "selection JSON object");
  createCommand.option("--trace-id <string>", "trace-id");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().createComment(compact({
        docId: requiredOption(options, "docId"),
        authorId: requiredOption(options, "authorId"),
        bodyMd: requiredOption(options, "bodyMd"),
        parentCommentId: options.parentCommentId,
        selection: jsonObjectOption(options, "selectionJson"),
        traceId: options.traceId,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("doc_comments delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().deleteComment({ commentId: requiredOption(options, "id") }) ?? { ok: true }
    );
  });

  const listCommand = command.command("list");
  listCommand.description("doc_comments list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--doc-id <string>", "doc-id");
  listCommand.option("--include-resolved", "include-resolved");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().listComments(compact({
        docId: requiredOption(options, "docId"),
        resolved: options.includeResolved === true ? undefined : options.resolved,
      }))
    );
  });

  const resolveCommand = command.command("resolve");
  resolveCommand.description("doc_comments resolve");
  resolveCommand.option("--json", "Emit JSON output");
  resolveCommand.option("--id <string>", "id");
  resolveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().resolveComment({
        commentId: requiredOption(options, "id"),
        resolved: true,
      })
    );
  });

  const updateCommand = command.command("update");
  updateCommand.description("doc_comments update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--body-md <string>", "body-md");
  updateCommand.option("--id <string>", "id");
  updateCommand.option("--resolved", "resolved");
  updateCommand.option("--selection-json <json>", "selection JSON object");
  updateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().updateComment(compact({
        commentId: requiredOption(options, "id"),
        bodyMd: options.bodyMd,
        selection: jsonObjectOption(options, "selectionJson"),
        status: options.resolved === true ? "resolved" : undefined,
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

function documentClient() {
  const caller = createDocumentApiCallerFromEnv();
  if (!caller) {
    throw new Error("Document API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.docs;
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

function jsonObjectOption(options: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
