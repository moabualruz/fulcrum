import type { Command } from "commander";

const GENERATED_COMMAND_FACTORIES = {
  automations: async () => (await import("./generated/automations.ts")).createAutomationsCommand(),
  comments: async () => (await import("./generated/comments.ts")).createCommentsCommand(),
  customFieldDefs: async () => (await import("./generated/customFieldDefs.ts")).createCustomFieldDefsCommand(),
  recurrence: async () => (await import("./generated/recurrence.ts")).createRecurrenceCommand(),
  relationships: async () => (await import("./generated/relationships.ts")).createRelationshipsCommand(),
  saved_views: async () => (await import("./generated/saved_views.ts")).createSavedViewsCommand(),
  taskCustomFields: async () => (await import("./generated/taskCustomFields.ts")).createTaskCustomFieldsCommand(),
  templates: async () => (await import("./generated/templates.ts")).createTemplatesCommand(),
} satisfies Record<string, () => Promise<Command>>;

export type GeneratedCommandName = keyof typeof GENERATED_COMMAND_FACTORIES;

export function isGeneratedCommandName(value: string): value is GeneratedCommandName {
  return value in GENERATED_COMMAND_FACTORIES;
}

export async function runGeneratedCommand(name: GeneratedCommandName, argv: readonly string[]): Promise<void> {
  const command = await GENERATED_COMMAND_FACTORIES[name]();
  command.exitOverride();
  await command.parseAsync([...argv], { from: "user" });
}
