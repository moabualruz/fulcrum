import { Command, Option } from "commander";

import { createSkillSupplyApiCallerFromEnv } from "@platform-core/interface/http/skill-supply-api-client.ts";

export function createFulcrumSkillsCommand(): Command {
  const command = new Command("fulcrum_skills");
  command.description("Generated fulcrum_skills commands.");

  const conflictsCommand = command.command("conflicts");
  conflictsCommand.description("Generated fulcrum_skills conflict commands.");

  const conflictsListCommand = conflictsCommand.command("list");
  conflictsListCommand.description("fulcrum_skills conflicts list");
  conflictsListCommand.option("--json", "Emit JSON output");
  conflictsListCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await skillsClient().conflicts.list());
  });

  const conflictsOverrideCommand = conflictsCommand.command("override");
  conflictsOverrideCommand.description("fulcrum_skills conflicts override");
  conflictsOverrideCommand.option("--json", "Emit JSON output");
  conflictsOverrideCommand.option("--audit-note <string>", "audit-note");
  conflictsOverrideCommand.option("--conflict-id <string>", "conflict-id");
  conflictsOverrideCommand.addOption(new Option("--resolution <choice>", "resolution").choices(["local","upstream"]));
  conflictsOverrideCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().conflicts.override({
        auditNote: options.auditNote,
        conflictId: requiredOption(options, "conflictId"),
        resolution: requiredOption(options, "resolution"),
      })
    );
  });

  const installCommand = command.command("install");
  installCommand.description("fulcrum_skills install");
  installCommand.option("--json", "Emit JSON output");
  installCommand.option("--path <string>", "path");
  installCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().install({ path: requiredOption(options, "path") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("fulcrum_skills list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await skillsClient().list());
  });

  const lockCommand = command.command("lock");
  lockCommand.description("Generated fulcrum_skills lock commands.");

  const lockOverrideCommand = lockCommand.command("override");
  lockOverrideCommand.description("fulcrum_skills lock override");
  lockOverrideCommand.option("--json", "Emit JSON output");
  lockOverrideCommand.option("--actual-sha256 <string>", "actual-sha256");
  lockOverrideCommand.option("--audit-note <string>", "audit-note");
  lockOverrideCommand.option("--expected-sha256 <string>", "expected-sha256");
  lockOverrideCommand.option("--slug <string>", "slug");
  lockOverrideCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().lock.override({
        actualSha256: requiredOption(options, "actualSha256"),
        auditNote: options.auditNote,
        expectedSha256: requiredOption(options, "expectedSha256"),
        slug: requiredOption(options, "slug"),
      })
    );
  });

  const registryCommand = command.command("registry");
  registryCommand.description("Generated fulcrum_skills registry commands.");

  const registryListCommand = registryCommand.command("list");
  registryListCommand.description("fulcrum_skills registry list");
  registryListCommand.option("--json", "Emit JSON output");
  registryListCommand.option("--org-id <string>", "org-id");
  registryListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().registryList({ orgId: options.orgId })
    );
  });

  const resolveConflictCommand = command.command("resolve-conflict");
  resolveConflictCommand.description("fulcrum_skills resolveConflict");
  resolveConflictCommand.option("--json", "Emit JSON output");
  resolveConflictCommand.addOption(new Option("--resolution <choice>", "resolution").choices(["local","upstream","editor"]));
  resolveConflictCommand.option("--slug <string>", "slug");
  resolveConflictCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().resolveConflict({
        resolution: requiredOption(options, "resolution"),
        slug: requiredOption(options, "slug"),
      })
    );
  });

  const syncCommand = command.command("sync");
  syncCommand.description("fulcrum_skills sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.option("--fetch-upstream", "fetch-upstream");
  syncCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().sync({ fetchUpstream: options.fetchUpstream === true })
    );
  });

  const uninstallCommand = command.command("uninstall");
  uninstallCommand.description("fulcrum_skills uninstall");
  uninstallCommand.option("--json", "Emit JSON output");
  uninstallCommand.option("--slug <string>", "slug");
  uninstallCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await skillsClient().uninstall({ slug: requiredOption(options, "slug") })
    );
  });

  const upgradeCommand = command.command("upgrade");
  upgradeCommand.description("fulcrum_skills upgrade");
  upgradeCommand.option("--json", "Emit JSON output");
  upgradeCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await skillsClient().upgrade({ slug: "all" }));
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

function skillsClient() {
  const caller = createSkillSupplyApiCallerFromEnv();
  if (!caller) {
    throw new Error("Skill supply API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.fulcrumSkills;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
