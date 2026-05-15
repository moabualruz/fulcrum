import { Command, Option } from "commander";

import { createDocumentApiCallerFromEnv } from "@knowledge-workspace/interface/http/document-api-client.ts";

export function createDocLinksCommand(): Command {
  const command = new Command("doc_links");
  command.description("Generated doc_links commands.");

  const createCommand = command.command("create");
  createCommand.description("doc_links create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--source-doc-id <string>", "source-doc-id");
  createCommand.option("--target-doc-id <string>", "target-doc-id");
  createCommand.option("--link-type <string>", "link-type");
  createCommand.option("--trace-id <string>", "trace-id");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().createLink(compact({
        sourceDocId: requiredOption(options, "sourceDocId"),
        targetDocId: requiredOption(options, "targetDocId"),
        linkType: options.linkType,
        traceId: options.traceId,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("doc_links delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().deleteLink({ linkId: requiredOption(options, "id") }) ?? { ok: true }
    );
  });

  const listCommand = command.command("list");
  listCommand.description("doc_links list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--doc-id <string>", "doc-id");
  listCommand.addOption(new Option("--direction <choice>", "direction").choices(["backlinks", "forward", "forward-links"]).default("backlinks"));
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const docId = requiredOption(options, "docId");
      if (options.direction === "forward" || options.direction === "forward-links") {
        return await documentClient().listForwardLinks({ docId });
      }
      return await documentClient().listBacklinks({ docId });
    });
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
      value !== undefined && value !== null && value !== ""
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
