import { Command, Option } from "commander";

export function createDocsCommand(): Command {
  const command = new Command("docs");
  command.description("Generated docs commands.");

  const commentsCreateCommand = command.command("comments create");
  commentsCreateCommand.description("docs comments create");
  commentsCreateCommand.option("--json", "Emit JSON output");
  commentsCreateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.comments.create is not wired yet.");
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

  const commentsDeleteCommand = command.command("comments delete");
  commentsDeleteCommand.description("docs comments delete");
  commentsDeleteCommand.option("--json", "Emit JSON output");
  commentsDeleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.comments.delete is not wired yet.");
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

  const commentsListCommand = command.command("comments list");
  commentsListCommand.description("docs comments list");
  commentsListCommand.option("--json", "Emit JSON output");
  commentsListCommand.option("--resolved", "resolved");
  commentsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.comments.list is not wired yet.");
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

  const commentsResolveCommand = command.command("comments resolve");
  commentsResolveCommand.description("docs comments resolve");
  commentsResolveCommand.option("--json", "Emit JSON output");
  commentsResolveCommand.option("--resolved", "resolved");
  commentsResolveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.comments.resolve is not wired yet.");
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

  const commentsUpdateCommand = command.command("comments update");
  commentsUpdateCommand.description("docs comments update");
  commentsUpdateCommand.option("--json", "Emit JSON output");
  commentsUpdateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.comments.update is not wired yet.");
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
  createCommand.option("--body-md <string>", "body-md");
  createCommand.option("--sort-position <number>", "sort-position", Number.parseFloat);
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.create is not wired yet.");
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
  deleteCommand.option("--hard", "hard");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.delete is not wired yet.");
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
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.get is not wired yet.");
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

  const linksListBacklinksCommand = command.command("links list-backlinks");
  linksListBacklinksCommand.description("docs links listBacklinks");
  linksListBacklinksCommand.option("--json", "Emit JSON output");
  linksListBacklinksCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.links.listBacklinks is not wired yet.");
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

  const linksListForwardLinksCommand = command.command("links list-forward-links");
  linksListForwardLinksCommand.description("docs links listForwardLinks");
  linksListForwardLinksCommand.option("--json", "Emit JSON output");
  linksListForwardLinksCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.links.listForwardLinks is not wired yet.");
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
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--offset <number>", "offset", Number.parseFloat);
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.list is not wired yet.");
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

  const templatesListCommand = command.command("templates list");
  templatesListCommand.description("docs templates list");
  templatesListCommand.option("--json", "Emit JSON output");
  templatesListCommand.option("--project-id <string>", "project-id");
  templatesListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.templates.list is not wired yet.");
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

  const templatesResolveCommand = command.command("templates resolve");
  templatesResolveCommand.description("docs templates resolve");
  templatesResolveCommand.option("--json", "Emit JSON output");
  templatesResolveCommand.addOption(new Option("--doc-type <choice>", "doc-type").choices([]));
  templatesResolveCommand.option("--project-id <string>", "project-id");
  templatesResolveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.templates.resolve is not wired yet.");
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
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.update is not wired yet.");
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

  const versionsDiffCommand = command.command("versions diff");
  versionsDiffCommand.description("docs versions diff");
  versionsDiffCommand.option("--json", "Emit JSON output");
  versionsDiffCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.versions.diff is not wired yet.");
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

  const versionsGetCommand = command.command("versions get");
  versionsGetCommand.description("docs versions get");
  versionsGetCommand.option("--json", "Emit JSON output");
  versionsGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.versions.get is not wired yet.");
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

  const versionsListCommand = command.command("versions list");
  versionsListCommand.description("docs versions list");
  versionsListCommand.option("--json", "Emit JSON output");
  versionsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.versions.list is not wired yet.");
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

  const versionsRestoreCommand = command.command("versions restore");
  versionsRestoreCommand.description("docs versions restore");
  versionsRestoreCommand.option("--json", "Emit JSON output");
  versionsRestoreCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for docs.versions.restore is not wired yet.");
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
