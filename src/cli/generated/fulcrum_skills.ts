import { Command, Option } from "commander";

export function createFulcrumSkillsCommand(): Command {
  const command = new Command("fulcrum_skills");
  command.description("Generated fulcrum_skills commands.");

  const conflictsListCommand = command.command("conflicts list");
  conflictsListCommand.description("fulcrum_skills conflicts list");
  conflictsListCommand.option("--json", "Emit JSON output");
  conflictsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.conflicts.list requires an explicit surface adapter.");
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

  const conflictsOverrideCommand = command.command("conflicts override");
  conflictsOverrideCommand.description("fulcrum_skills conflicts override");
  conflictsOverrideCommand.option("--json", "Emit JSON output");
  conflictsOverrideCommand.option("--audit-note <string>", "audit-note");
  conflictsOverrideCommand.option("--conflict-id <string>", "conflict-id");
  conflictsOverrideCommand.addOption(new Option("--resolution <choice>", "resolution").choices(["local","upstream"]));
  conflictsOverrideCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.conflicts.override requires an explicit surface adapter.");
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

  const installCommand = command.command("install");
  installCommand.description("fulcrum_skills install");
  installCommand.option("--json", "Emit JSON output");
  installCommand.option("--path <string>", "path");
  installCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.install requires an explicit surface adapter.");
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
  listCommand.description("fulcrum_skills list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.list requires an explicit surface adapter.");
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

  const lockOverrideCommand = command.command("lock override");
  lockOverrideCommand.description("fulcrum_skills lock override");
  lockOverrideCommand.option("--json", "Emit JSON output");
  lockOverrideCommand.option("--actual-sha256 <string>", "actual-sha256");
  lockOverrideCommand.option("--audit-note <string>", "audit-note");
  lockOverrideCommand.option("--expected-sha256 <string>", "expected-sha256");
  lockOverrideCommand.option("--slug <string>", "slug");
  lockOverrideCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.lock.override requires an explicit surface adapter.");
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

  const registryListCommand = command.command("registry list");
  registryListCommand.description("fulcrum_skills registry list");
  registryListCommand.option("--json", "Emit JSON output");
  registryListCommand.option("--org-id <string>", "org-id");
  registryListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.registry.list requires an explicit surface adapter.");
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

  const resolveConflictCommand = command.command("resolve-conflict");
  resolveConflictCommand.description("fulcrum_skills resolveConflict");
  resolveConflictCommand.option("--json", "Emit JSON output");
  resolveConflictCommand.addOption(new Option("--resolution <choice>", "resolution").choices(["local","upstream","editor"]));
  resolveConflictCommand.option("--slug <string>", "slug");
  resolveConflictCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.resolveConflict requires an explicit surface adapter.");
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

  const syncCommand = command.command("sync");
  syncCommand.description("fulcrum_skills sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.option("--fetch-upstream", "fetch-upstream");
  syncCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.sync requires an explicit surface adapter.");
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

  const uninstallCommand = command.command("uninstall");
  uninstallCommand.description("fulcrum_skills uninstall");
  uninstallCommand.option("--json", "Emit JSON output");
  uninstallCommand.option("--slug <string>", "slug");
  uninstallCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.uninstall requires an explicit surface adapter.");
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

  const upgradeCommand = command.command("upgrade");
  upgradeCommand.description("fulcrum_skills upgrade");
  upgradeCommand.option("--json", "Emit JSON output");
  upgradeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for fulcrum_skills.upgrade requires an explicit surface adapter.");
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
