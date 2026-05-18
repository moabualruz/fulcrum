import { Command, Option } from "commander";

export function createArtifactsCommand(): Command {
  const command = new Command("artifacts");
  command.description("Generated artifacts commands.");

  const acceptCommand = command.command("accept");
  acceptCommand.description("artifacts accept");
  acceptCommand.option("--json", "Emit JSON output");
  acceptCommand.option("--id <string>", "Artifact identifier.");
  acceptCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.accept requires an explicit surface adapter.");
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

  const archiveCommand = command.command("archive");
  archiveCommand.description("artifacts archive");
  archiveCommand.option("--json", "Emit JSON output");
  archiveCommand.option("--id <string>", "Artifact identifier.");
  archiveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.archive requires an explicit surface adapter.");
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

  const deleteCommand = command.command("delete");
  deleteCommand.description("artifacts delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--hard", "Hard-delete: remove from disk + DB row.");
  deleteCommand.option("--id <string>", "Artifact identifier.");
  deleteCommand.option("--confirm <string>", "Required confirmation token for hard delete; must match artifact identifier.");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.delete requires an explicit surface adapter.");
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

  const downloadCommand = command.command("download");
  downloadCommand.description("artifacts download");
  downloadCommand.option("--json", "Emit JSON output");
  downloadCommand.option("--id <string>", "Artifact identifier.");
  downloadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.download requires an explicit surface adapter.");
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

  const getCommand = command.command("get");
  getCommand.description("artifacts get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "Artifact identifier.");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.get requires an explicit surface adapter.");
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

  const listCommand = command.command("list");
  listCommand.description("artifacts list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--archived", "Filter by archive state.");
  listCommand.option("--mime <string>", "Filter by MIME type.");
  listCommand.option("--org-id <string>", "Filter by organisation. Omit for current org.");
  listCommand.option("--project-id <string>", "Filter by project.");
  listCommand.option("--run-id <string>", "Filter by producing run.");
  listCommand.option("--task-id <string>", "Filter by linked task.");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.list requires an explicit surface adapter.");
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

  const rejectCommand = command.command("reject");
  rejectCommand.description("artifacts reject");
  rejectCommand.option("--json", "Emit JSON output");
  rejectCommand.option("--id <string>", "Artifact identifier.");
  rejectCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.reject requires an explicit surface adapter.");
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

  const unarchiveCommand = command.command("unarchive");
  unarchiveCommand.description("artifacts unarchive");
  unarchiveCommand.option("--json", "Emit JSON output");
  unarchiveCommand.option("--id <string>", "Artifact identifier.");
  unarchiveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.unarchive requires an explicit surface adapter.");
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

  const uploadCommand = command.command("upload");
  uploadCommand.description("artifacts upload");
  uploadCommand.option("--json", "Emit JSON output");
  uploadCommand.option("--doc-id <string>", "Linked document, when available.");
  uploadCommand.option("--filename <string>", "Original filename.");
  uploadCommand.option("--mime <string>", "MIME type.");
  uploadCommand.option("--project-id <string>", "Project scope, when available.");
  uploadCommand.option("--run-id <string>", "Producing run, when available.");
  uploadCommand.option("--task-id <string>", "Linked task, when available.");
  uploadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for artifacts.upload requires an explicit surface adapter.");
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
