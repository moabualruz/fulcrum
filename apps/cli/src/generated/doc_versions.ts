import { Command } from "commander";
import { createDocumentApiCallerFromEnv } from "@knowledge-workspace/interface/http/document-api-client.ts";

export function createDocVersionsCommand(): Command {
  const command = new Command("doc_versions");
  command.description("Generated doc_versions commands.");

  const diffCommand = command.command("diff");
  diffCommand.description("doc_versions diff");
  diffCommand.option("--json", "Emit JSON output");
  diffCommand.option("--document-id <string>", "document-id");
  diffCommand.option("--version-id <string>", "version-id");
  diffCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().diffVersionById({
        docId: requiredOption(options, "documentId"),
        versionId: requiredOption(options, "versionId"),
      })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("doc_versions get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--document-id <string>", "document-id");
  getCommand.option("--version-id <string>", "version-id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().getVersionById({
        docId: requiredOption(options, "documentId"),
        versionId: requiredOption(options, "versionId"),
      })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("doc_versions list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--document-id <string>", "document-id");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().listVersions({ docId: requiredOption(options, "documentId") })
    );
  });

  const restoreCommand = command.command("restore");
  restoreCommand.description("doc_versions restore");
  restoreCommand.option("--json", "Emit JSON output");
  restoreCommand.option("--document-id <string>", "document-id");
  restoreCommand.option("--version-id <string>", "version-id");
  restoreCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await documentClient().restoreVersionById({
        docId: requiredOption(options, "documentId"),
        versionId: requiredOption(options, "versionId"),
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

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
