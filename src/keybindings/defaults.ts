import {
  KEYBINDING_ACTIONS,
  KeybindingAction,
  KeybindingMapSchema,
  ShortcutSchema,
  type Keybinding,
  type KeybindingContext,
  type KeybindingMap,
} from "./schema.ts";

export type KeybindingPlatform = "darwin" | "linux" | "win32" | NodeJS.Platform;

export type TenantSettingsReader = {
  get(key: string): string | undefined | null | Promise<string | undefined | null>;
};

export type KeybindingConflict = {
  context: KeybindingContext;
  key: string;
  actions: KeybindingAction[];
};

const contexts: Record<KeybindingAction, KeybindingContext> = {
  "navigate.projects": "navigation",
  "navigate.tasks": "navigation",
  "navigate.docs": "navigation",
  "navigate.sprints": "navigation",
  "navigate.runs": "navigation",
  "navigate.search": "navigation",
  "navigate.inbox": "navigation",
  "navigate.repos": "navigation",
  "navigate.artifacts": "navigation",
  "navigate.memories": "navigation",
  "navigate.context": "navigation",
  "navigate.settings": "navigation",
  "navigate.back": "navigation",
  "navigate.forward": "navigation",
  "task.create": "task",
  "task.update": "task",
  "task.delete": "task",
  "task.move-status": "task",
  "task.bulk-select": "task",
  "task.claim": "task",
  "task.assign": "task",
  "task.set-priority": "task",
  "task.set-due-date": "task",
  "task.add-label": "task",
  "task.open-detail": "task",
  "task.next": "task",
  "task.previous": "task",
  "doc.create": "doc",
  "doc.save": "doc",
  "doc.delete": "doc",
  "doc.move": "doc",
  "doc.toggle-raw-yaml": "doc",
  "doc.open-versions": "doc",
  "doc.restore-version": "doc",
  "doc.comment": "doc",
  "doc.search-links": "doc",
  "sprint.activate": "sprint",
  "sprint.complete": "sprint",
  "sprint.plan": "sprint",
  "sprint.open-board": "sprint",
  "sprint.show-burndown": "sprint",
  "palette.open": "global",
  "palette.command-mode": "global",
  "search.focus": "global",
  "search.saved": "global",
  "run.dispatch": "run",
  "run.cancel": "run",
  "run.retry": "run",
  "run.open-live-monitor": "run",
  "view.toggle-sidebar": "view",
  "view.cycle-view-type": "view",
  "view.toggle-help": "view",
  "view.refresh": "view",
  "doctor.open": "global",
  "flags.open": "global",
};

function primaryModifier(platform: KeybindingPlatform): "⌘" | "Ctrl" {
  return platform === "darwin" ? "⌘" : "Ctrl";
}

export function getDefaultKeybindings(
  platform: KeybindingPlatform = process.platform,
): KeybindingMap {
  const mod = primaryModifier(platform);
  const keys: Record<KeybindingAction, string> = {
    "navigate.projects": "Alt+P",
    "navigate.tasks": "Alt+T",
    "navigate.docs": "Alt+D",
    "navigate.sprints": "Alt+S",
    "navigate.runs": "Alt+R",
    "navigate.search": "Alt+/",
    "navigate.inbox": "Alt+I",
    "navigate.repos": "Alt+O",
    "navigate.artifacts": "Alt+A",
    "navigate.memories": "Alt+M",
    "navigate.context": "Alt+C",
    "navigate.settings": "Alt+,",
    "navigate.back": "Alt+ArrowLeft",
    "navigate.forward": "Alt+ArrowRight",
    "task.create": "C",
    "task.update": "E",
    "task.delete": "Shift+D",
    "task.move-status": "S",
    "task.bulk-select": "X",
    "task.claim": "M",
    "task.assign": "A",
    "task.set-priority": "P",
    "task.set-due-date": "D",
    "task.add-label": "L",
    "task.open-detail": "Enter",
    "task.next": "]",
    "task.previous": "[",
    "doc.create": "C",
    "doc.save": `${mod}+S`,
    "doc.delete": "Shift+D",
    "doc.move": "M",
    "doc.toggle-raw-yaml": `${mod}+Y`,
    "doc.open-versions": "V",
    "doc.restore-version": "R",
    "doc.comment": `${mod}+Shift+M`,
    "doc.search-links": `${mod}+L`,
    "sprint.activate": "A",
    "sprint.complete": "Shift+C",
    "sprint.plan": "P",
    "sprint.open-board": "B",
    "sprint.show-burndown": "D",
    "palette.open": `${mod}+K`,
    "palette.command-mode": `${mod}+Shift+K`,
    "search.focus": "Ctrl+Shift+F",
    "search.saved": `${mod}+Shift+S`,
    "run.dispatch": `${mod}+Enter`,
    "run.cancel": "Esc",
    "run.retry": "R",
    "run.open-live-monitor": "L",
    "view.toggle-sidebar": `${mod}+B`,
    "view.cycle-view-type": `${mod}+J`,
    "view.toggle-help": "?",
    "view.refresh": `${mod}+R`,
    "doctor.open": `${mod}+Shift+D`,
    "flags.open": `${mod}+Alt+F`,
  };

  const bindings = Object.fromEntries(
    KEYBINDING_ACTIONS.map((action) => [
      action,
      { context: contexts[action], key: keys[action] } satisfies Keybinding,
    ]),
  );
  return KeybindingMapSchema.parse(bindings);
}

export function detectConflicts(bindings: KeybindingMap): KeybindingConflict[] {
  const buckets = new Map<string, KeybindingAction[]>();
  for (const action of KEYBINDING_ACTIONS) {
    const binding = bindings[action];
    const bucketKey = `${binding.context}\0${binding.key}`;
    buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), action]);
  }

  return [...buckets.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([bucketKey, actions]) => {
      const [context, key] = bucketKey.split("\0") as [KeybindingContext, string];
      return { context, key, actions };
    });
}

export async function resolveKeybindings(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}): Promise<KeybindingMap> {
  const defaults = getDefaultKeybindings(options.platform);
  if (!options.settings) return defaults;

  const resolved: KeybindingMap = { ...defaults };
  for (const action of KEYBINDING_ACTIONS) {
    const override = await options.settings.get(`keybinding.${action}`);
    if (typeof override === "string" && ShortcutSchema.safeParse(override).success) {
      resolved[action] = { ...defaults[action], key: override.trim() };
    }
  }

  return KeybindingMapSchema.parse(resolved);
}
