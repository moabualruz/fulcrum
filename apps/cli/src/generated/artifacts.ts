import { Command } from "commander";
import { createArtifactApiCallerFromEnv } from "@workflow-coordination/interface/http/artifact-api-client.ts";

export function createArtifactsCommand(): Command {
  const command = new Command("artifacts");
  command.description("Generated artifacts commands.");

  const acceptCommand = command.command("accept");
  acceptCommand.description("artifacts accept");
  acceptCommand.option("--json", "Emit JSON output");
  acceptCommand.option("--id <string>", "Artifact identifier.");
  acceptCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().accept({ id: requiredOption(options, "id") })
    );
  });

  const archiveCommand = command.command("archive");
  archiveCommand.description("artifacts archive");
  archiveCommand.option("--json", "Emit JSON output");
  archiveCommand.option("--id <string>", "Artifact identifier.");
  archiveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().archive({ id: requiredOption(options, "id") })
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("artifacts delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--hard", "Hard-delete: remove from disk + DB row.");
  deleteCommand.option("--id <string>", "Artifact identifier.");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().delete({
        id: requiredOption(options, "id"),
        hard: options.hard === true,
      })
    );
  });

  const downloadCommand = command.command("download");
  downloadCommand.description("artifacts download");
  downloadCommand.option("--json", "Emit JSON output");
  downloadCommand.option("--id <string>", "Artifact identifier.");
  downloadCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().download({ id: requiredOption(options, "id") })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("artifacts get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "Artifact identifier.");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("artifacts list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--archived", "Filter by archive state.");
  listCommand.option("--kind <string>", "Filter by artifact kind.");
  listCommand.option("--mime <string>", "Filter by MIME type.");
  listCommand.option("--org-id <string>", "Filter by organisation. Omit for current org.");
  listCommand.option("--project-id <string>", "Filter by project.");
  listCommand.option("--run-id <string>", "Filter by producing run.");
  listCommand.option("--task-id <string>", "Filter by linked task.");
  listCommand.option("--trace-id <string>", "Filter by trace identifier.");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().list(compact({
        projectId: options.projectId,
        traceId: options.traceId,
        kind: options.kind,
      }))
    );
  });

  const rejectCommand = command.command("reject");
  rejectCommand.description("artifacts reject");
  rejectCommand.option("--json", "Emit JSON output");
  rejectCommand.option("--id <string>", "Artifact identifier.");
  rejectCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().reject({ id: requiredOption(options, "id") })
    );
  });

  const unarchiveCommand = command.command("unarchive");
  unarchiveCommand.description("artifacts unarchive");
  unarchiveCommand.option("--json", "Emit JSON output");
  unarchiveCommand.option("--id <string>", "Artifact identifier.");
  unarchiveCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().unarchive({ id: requiredOption(options, "id") })
    );
  });

  const uploadCommand = command.command("upload");
  uploadCommand.description("artifacts upload");
  uploadCommand.option("--json", "Emit JSON output");
  uploadCommand.option("--body-path <string>", "Stored body path.");
  uploadCommand.option("--checksum-sha256 <string>", "Artifact checksum.");
  uploadCommand.option("--doc-id <string>", "Linked document, when available.");
  uploadCommand.option("--filename <string>", "Original filename.");
  uploadCommand.option("--kind <string>", "Artifact kind.");
  uploadCommand.option("--mime <string>", "MIME type.");
  uploadCommand.option("--project-id <string>", "Project scope, when available.");
  uploadCommand.option("--run-id <string>", "Producing run, when available.");
  uploadCommand.option("--size-bytes <string>", "Artifact size in bytes.");
  uploadCommand.option("--task-id <string>", "Linked task, when available.");
  uploadCommand.option("--title <string>", "Artifact title.");
  uploadCommand.option("--trace-id <string>", "Trace identifier.");
  uploadCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await artifactClient().upload(compact({
        projectId: requiredOption(options, "projectId"),
        traceId: requiredOption(options, "traceId"),
        filename: requiredOption(options, "filename"),
        mime: options.mime,
        sizeBytes: options.sizeBytes,
        kind: options.kind,
        title: options.title,
        runId: options.runId,
        taskId: options.taskId,
        docId: options.docId,
        bodyPath: options.bodyPath,
        checksumSha256: options.checksumSha256,
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

function artifactClient() {
  const caller = createArtifactApiCallerFromEnv();
  if (!caller) {
    throw new Error("Artifact API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.artifacts;
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
