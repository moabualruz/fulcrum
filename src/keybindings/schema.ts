import { z } from "zod";

export const KEYBINDING_ACTIONS = [
  "navigate.projects",
  "navigate.tasks",
  "navigate.docs",
  "navigate.sprints",
  "navigate.runs",
  "navigate.search",
  "navigate.inbox",
  "navigate.repos",
  "navigate.artifacts",
  "navigate.memories",
  "navigate.context",
  "navigate.settings",
  "navigate.back",
  "navigate.forward",
  "task.create",
  "task.update",
  "task.delete",
  "task.move-status",
  "task.bulk-select",
  "task.claim",
  "task.assign",
  "task.set-priority",
  "task.set-due-date",
  "task.add-label",
  "task.open-detail",
  "task.next",
  "task.previous",
  "doc.create",
  "doc.save",
  "doc.delete",
  "doc.move",
  "doc.toggle-raw-yaml",
  "doc.open-versions",
  "doc.restore-version",
  "doc.comment",
  "doc.search-links",
  "sprint.activate",
  "sprint.complete",
  "sprint.plan",
  "sprint.open-board",
  "sprint.show-burndown",
  "palette.open",
  "palette.command-mode",
  "search.focus",
  "search.saved",
  "run.dispatch",
  "run.cancel",
  "run.retry",
  "run.open-live-monitor",
  "view.toggle-sidebar",
  "view.cycle-view-type",
  "view.toggle-help",
  "view.refresh",
  "doctor.open",
  "flags.open",
] as const;

export const KeybindingAction = z.enum(KEYBINDING_ACTIONS);
export type KeybindingAction = z.infer<typeof KeybindingAction>;

export const KeybindingContext = z.enum([
  "global",
  "navigation",
  "task",
  "doc",
  "sprint",
  "run",
  "view",
]);
export type KeybindingContext = z.infer<typeof KeybindingContext>;

export const ShortcutSchema = z
  .string()
  .trim()
  .regex(/^(?:(?:Ctrl|Alt|Shift|Meta|⌘)\+)*(?:[A-Za-z0-9?/\[\]\-.=,;`]|Esc|Enter|Tab|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/);

export const KeybindingSchema = z.object({
  context: KeybindingContext,
  key: ShortcutSchema,
});
export type Keybinding = z.infer<typeof KeybindingSchema>;

export const KeybindingMapSchema = z.record(KeybindingAction, KeybindingSchema);
export type KeybindingMap = z.infer<typeof KeybindingMapSchema>;
