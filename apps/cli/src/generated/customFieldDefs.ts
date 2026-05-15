import { Command } from "commander";
import { createCustomFieldApiCallerFromEnv } from "@work-management/interface/http/custom-field-api-client.ts";
import { runGeneratedAction } from "./custom_fields.ts";

export function createCustomFieldDefsCommand(): Command {
  const command = new Command("customFieldDefs");
  command.description("Generated customFieldDefs commands.");

  const listCommand = command.command("list");
  listCommand.description("customFieldDefs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--project-id <string>", "project-id");
  listCommand.option("--entity-type <string>", "entity-type");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => {
      const caller = createCustomFieldApiCallerFromEnv();
      if (!caller) {
        throw new Error("Custom field API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
      }
      return await caller.customFieldDefs.list({
        projectId: options.projectId,
        entityType: options.entityType,
      });
    });
  });

  return command;
}
