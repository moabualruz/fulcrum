import { describe, expect, test } from "bun:test";
import {
  KEYBINDING_ACTIONS,
  KeybindingAction,
  KeybindingMapSchema,
} from "../../src/keybindings/schema.ts";
import {
  detectConflicts,
  getDefaultKeybindings,
  resolveKeybindings,
} from "../../src/keybindings/defaults.ts";

const requiredActions = [
  "navigate.projects",
  "navigate.tasks",
  "navigate.docs",
  "navigate.sprints",
  "navigate.runs",
  "navigate.search",
  "navigate.inbox",
  "navigate.repos",
  "task.create",
  "task.update",
  "task.delete",
  "task.move-status",
  "task.bulk-select",
  "task.claim",
  "doc.create",
  "doc.save",
  "doc.delete",
  "doc.move",
  "doc.toggle-raw-yaml",
  "sprint.activate",
  "sprint.complete",
  "sprint.plan",
  "palette.open",
  "palette.command-mode",
  "search.focus",
  "run.dispatch",
  "run.cancel",
  "view.toggle-sidebar",
  "view.cycle-view-type",
  "doctor.open",
  "flags.open",
] as const;

describe("KeybindingAction", () => {
  test("covers the PRD action families with a 40+ action registry", () => {
    expect(KEYBINDING_ACTIONS.length).toBeGreaterThanOrEqual(40);

    for (const action of requiredActions) {
      expect(KeybindingAction.parse(action)).toBe(action);
    }
  });
});

describe("default keybindings", () => {
  test("provide a valid binding for every action", () => {
    const defaults = getDefaultKeybindings("linux");

    expect(Object.keys(defaults).sort()).toEqual([...KEYBINDING_ACTIONS].sort());
    expect(KeybindingMapSchema.parse(defaults)).toEqual(defaults);
  });

  test("use platform-aware primary modifiers", () => {
    expect(getDefaultKeybindings("darwin")["palette.open"].key).toBe("⌘+K");
    expect(getDefaultKeybindings("linux")["palette.open"].key).toBe("Ctrl+K");
    expect(getDefaultKeybindings("win32")["palette.open"].key).toBe("Ctrl+K");
  });

  test("ship without duplicate bindings in the same context", () => {
    expect(detectConflicts(getDefaultKeybindings("linux"))).toEqual([]);
  });
});

describe("conflict detector", () => {
  test("returns conflicts for duplicate bindings within the same context", () => {
    const defaults = getDefaultKeybindings("linux");
    const conflicts = detectConflicts({
      ...defaults,
      "search.focus": { context: "global", key: defaults["palette.open"].key },
    });

    expect(conflicts).toEqual([
      {
        context: "global",
        key: "Ctrl+K",
        actions: ["palette.open", "search.focus"],
      },
    ]);
  });
});

describe("override resolution", () => {
  test("reads TenantSettingsRepository-compatible keybinding.<action> overrides and ignores invalid values", async () => {
    const settings = new Map<string, string>([
      ["keybinding.palette.open", "Ctrl+P"],
      ["keybinding.search.focus", "not a shortcut"],
    ]);

    const bindings = await resolveKeybindings({
      platform: "linux",
      settings: { get: async (key) => settings.get(key) },
    });

    expect(bindings["palette.open"].key).toBe("Ctrl+P");
    expect(bindings["search.focus"].key).toBe("Ctrl+Shift+F");
    expect(KeybindingMapSchema.parse(bindings)).toEqual(bindings);
  });
});
