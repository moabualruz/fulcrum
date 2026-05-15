import { Command, Option } from "commander";
import { createDocumentApiCallerFromEnv } from "@knowledge-workspace/interface/http/document-api-client.ts";

export function createDocsCommand(): Command {
  const command = new Command("docs");
  command.description("Generated docs commands.");

  const commentsCommand = command.command("comments");
  commentsCommand.description("Generated docs comment commands.");

  const commentsCreateCommand = commentsCommand.command("create");
  commentsCreateCommand.description("docs comments create");
  commentsCreateCommand.option("--json", "Emit JSON output");
  commentsCreateCommand.option("--doc-id <string>", "doc id");
  commentsCreateCommand.option("--author-id <string>", "author id");
  commentsCreateCommand.option("--body-md <string>", "comment markdown");
  commentsCreateCommand.option("--parent-comment-id <string>", "parent comment id");
  commentsCreateCommand.option("--selection-json <json>", "selection JSON object");
  commentsCreateCommand.option("--trace-id <string>", "trace id");
  commentsCreateCommand.action(async (options) => {
    try {
      const result = await documentClient().createComment(compact({
        docId: requiredOption(options, "docId"),
        authorId: requiredOption(options, "authorId"),
        bodyMd: requiredOption(options, "bodyMd"),
        parentCommentId: options.parentCommentId,
        selection: jsonObjectOption(options, "selectionJson"),
        traceId: options.traceId,
      }));
      printGeneratedResult(result, options);
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

  const commentsDeleteCommand = commentsCommand.command("delete");
  commentsDeleteCommand.description("docs comments delete");
  commentsDeleteCommand.option("--json", "Emit JSON output");
  commentsDeleteCommand.option("--comment-id <string>", "comment id");
  commentsDeleteCommand.action(async (options) => {
    try {
      const result = await documentClient().deleteComment({ commentId: requiredOption(options, "commentId") });
      printGeneratedResult(result ?? { ok: true }, options);
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

  const commentsListCommand = commentsCommand.command("list");
  commentsListCommand.description("docs comments list");
  commentsListCommand.option("--json", "Emit JSON output");
  commentsListCommand.option("--doc-id <string>", "doc id");
  commentsListCommand.option("--resolved", "resolved");
  commentsListCommand.action(async (options) => {
    try {
      const result = await documentClient().listComments(compact({
        docId: requiredOption(options, "docId"),
        resolved: options.resolved === true ? true : undefined,
      }));
      printGeneratedResult(result, options);
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

  const commentsResolveCommand = commentsCommand.command("resolve");
  commentsResolveCommand.description("docs comments resolve");
  commentsResolveCommand.option("--json", "Emit JSON output");
  commentsResolveCommand.option("--comment-id <string>", "comment id");
  commentsResolveCommand.option("--resolved", "resolved");
  commentsResolveCommand.action(async (options) => {
    try {
      const result = await documentClient().resolveComment({
        commentId: requiredOption(options, "commentId"),
        resolved: options.resolved !== false,
      });
      printGeneratedResult(result, options);
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

  const commentsUpdateCommand = commentsCommand.command("update");
  commentsUpdateCommand.description("docs comments update");
  commentsUpdateCommand.option("--json", "Emit JSON output");
  commentsUpdateCommand.option("--comment-id <string>", "comment id");
  commentsUpdateCommand.option("--body-md <string>", "comment markdown");
  commentsUpdateCommand.option("--selection-json <json>", "selection JSON object");
  commentsUpdateCommand.option("--status <string>", "status");
  commentsUpdateCommand.action(async (options) => {
    try {
      const result = await documentClient().updateComment(compact({
        commentId: requiredOption(options, "commentId"),
        bodyMd: options.bodyMd,
        selection: jsonObjectOption(options, "selectionJson"),
        status: options.status,
      }));
      printGeneratedResult(result, options);
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

  const createCommand = command.command("create");
  createCommand.description("docs create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--title <string>", "title");
  createCommand.option("--project-id <string>", "project-id");
  createCommand.option("--body-md <string>", "body-md");
  createCommand.addOption(new Option("--doc-type <choice>", "doc-type").choices(["page", "wiki", "note", "template"]));
  createCommand.option("--scope <string>", "scope");
  createCommand.option("--sort-position <number>", "sort-position", Number.parseFloat);
  createCommand.option("--source-id <string>", "source-id");
  createCommand.option("--source-kind <string>", "source-kind");
  createCommand.action(async (options) => {
    try {
      const result = await documentClient().create(compact({
        projectId: options.projectId,
        title: requiredOption(options, "title"),
        type: options.docType,
        bodyMd: options.bodyMd,
      }));
      printGeneratedResult(result, options);
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
  deleteCommand.description("docs delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "doc id");
  deleteCommand.option("--hard", "hard");
  deleteCommand.action(async (options) => {
    try {
      const result = await documentClient().delete({ id: requiredOption(options, "id") });
      printGeneratedResult(result ?? { ok: true }, options);
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
  getCommand.description("docs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "doc id");
  getCommand.action(async (options) => {
    try {
      const result = await documentClient().get({ id: requiredOption(options, "id") });
      printGeneratedResult(result, options);
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

  const linksCommand = command.command("links");
  linksCommand.description("Generated docs link commands.");

  const linksListBacklinksCommand = linksCommand.command("list-backlinks");
  linksListBacklinksCommand.description("docs links listBacklinks");
  linksListBacklinksCommand.option("--json", "Emit JSON output");
  linksListBacklinksCommand.option("--doc-id <string>", "doc id");
  linksListBacklinksCommand.action(async (options) => {
    try {
      const result = await documentClient().listBacklinks({ docId: requiredOption(options, "docId") });
      printGeneratedResult(result, options);
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

  const linksListForwardLinksCommand = linksCommand.command("list-forward-links");
  linksListForwardLinksCommand.description("docs links listForwardLinks");
  linksListForwardLinksCommand.option("--json", "Emit JSON output");
  linksListForwardLinksCommand.option("--doc-id <string>", "doc id");
  linksListForwardLinksCommand.action(async (options) => {
    try {
      const result = await documentClient().listForwardLinks({ docId: requiredOption(options, "docId") });
      printGeneratedResult(result, options);
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
  listCommand.description("docs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--archived", "archived");
  listCommand.addOption(new Option("--doc-type <choice>", "doc-type").choices(["page", "wiki", "note", "template"]));
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--offset <number>", "offset", Number.parseFloat);
  listCommand.option("--org-id <string>", "org-id");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.option("--scope <string>", "scope");
  listCommand.action(async (options) => {
    try {
      const result = await documentClient().list(compact({
        orgId: options.orgId,
        projectId: options.projectId,
      }));
      printGeneratedResult(result, options);
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

  const templatesCommand = command.command("templates");
  templatesCommand.description("Generated docs template commands.");

  const templatesListCommand = templatesCommand.command("list");
  templatesListCommand.description("docs templates list");
  templatesListCommand.option("--json", "Emit JSON output");
  templatesListCommand.option("--project-id <string>", "project-id");
  templatesListCommand.action(async (options) => {
    try {
      const result = await documentClient().listTemplates(compact({
        projectId: options.projectId,
      }));
      printGeneratedResult(result, options);
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

  const templatesResolveCommand = templatesCommand.command("resolve");
  templatesResolveCommand.description("docs templates resolve");
  templatesResolveCommand.option("--json", "Emit JSON output");
  templatesResolveCommand.option("--doc-type <string>", "doc-type");
  templatesResolveCommand.option("--project-id <string>", "project-id");
  templatesResolveCommand.action(async (options) => {
    try {
      const result = await documentClient().resolveTemplate(compact({
        projectId: options.projectId,
        docType: options.docType,
      }));
      printGeneratedResult(result, options);
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

  const updateCommand = command.command("update");
  updateCommand.description("docs update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--id <string>", "doc id");
  updateCommand.option("--title <string>", "title");
  updateCommand.option("--body-md <string>", "body-md");
  updateCommand.addOption(new Option("--doc-type <choice>", "doc-type").choices(["page", "wiki", "note", "template"]));
  updateCommand.action(async (options) => {
    try {
      const result = await documentClient().update(compact({
        id: requiredOption(options, "id"),
        title: options.title,
        type: options.docType,
        bodyMd: options.bodyMd,
      }) as Record<string, unknown> & { id: string });
      printGeneratedResult(result, options);
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

  const versionsCommand = command.command("versions");
  versionsCommand.description("Generated docs version commands.");

  const versionsDiffCommand = versionsCommand.command("diff");
  versionsDiffCommand.description("docs versions diff");
  versionsDiffCommand.option("--json", "Emit JSON output");
  versionsDiffCommand.option("--doc-id <string>", "doc id");
  versionsDiffCommand.option("--from-version <number>", "from version", Number.parseFloat);
  versionsDiffCommand.option("--to-version <number>", "to version", Number.parseFloat);
  versionsDiffCommand.action(async (options) => {
    try {
      const result = await documentClient().diffVersions({
        docId: requiredOption(options, "docId"),
        fromVersion: requiredNumberOption(options, "fromVersion"),
        toVersion: requiredNumberOption(options, "toVersion"),
      });
      printGeneratedResult(result, options);
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

  const versionsGetCommand = versionsCommand.command("get");
  versionsGetCommand.description("docs versions get");
  versionsGetCommand.option("--json", "Emit JSON output");
  versionsGetCommand.option("--doc-id <string>", "doc id");
  versionsGetCommand.option("--version <number>", "version", Number.parseFloat);
  versionsGetCommand.action(async (options) => {
    try {
      const result = await documentClient().getVersion({
        docId: requiredOption(options, "docId"),
        version: requiredNumberOption(options, "version"),
      });
      printGeneratedResult(result, options);
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

  const versionsListCommand = versionsCommand.command("list");
  versionsListCommand.description("docs versions list");
  versionsListCommand.option("--json", "Emit JSON output");
  versionsListCommand.option("--doc-id <string>", "doc id");
  versionsListCommand.action(async (options) => {
    try {
      const result = await documentClient().listVersions({ docId: requiredOption(options, "docId") });
      printGeneratedResult(result, options);
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

  const versionsRestoreCommand = versionsCommand.command("restore");
  versionsRestoreCommand.description("docs versions restore");
  versionsRestoreCommand.option("--json", "Emit JSON output");
  versionsRestoreCommand.option("--doc-id <string>", "doc id");
  versionsRestoreCommand.option("--version <number>", "version", Number.parseFloat);
  versionsRestoreCommand.action(async (options) => {
    try {
      const result = await documentClient().restoreVersion({
        docId: requiredOption(options, "docId"),
        version: requiredNumberOption(options, "version"),
      });
      printGeneratedResult(result, options);
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

function requiredNumberOption(options: Record<string, unknown>, key: string): number {
  const value = options[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${key} is required.`);
}
