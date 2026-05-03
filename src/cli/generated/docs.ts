import { Command, Option } from "commander";

export function createDocsCommand(): Command {
  const command = new Command("docs");
  command.description("Generated docs commands.");

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

  return command;
}
