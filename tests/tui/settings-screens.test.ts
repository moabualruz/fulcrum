import { describe, expect, test } from "bun:test";

import { Renderer } from "../../src/tui/renderer.ts";
import {
  BackupSettingsScreen,
  DataSettingsScreen,
  ErrorsSettingsScreen,
  FeatureFlagsSettingsScreen,
  SecretsSettingsScreen,
  SettingsTabs,
  TelemetrySettingsScreen,
  ThemeSettingsScreen,
} from "../../src/tui/screens/settings.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

type SettingsTabName = InstanceType<typeof SettingsTabs>["current"];

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("SettingsTabs", () => {
  test("cycles seven settings tabs and exits to parent on Escape", async () => {
    let exited = false;
    const tabs = new SettingsTabs({ onExit: () => { exited = true; } });

    expect(tabs.current).toBe("theme");
    for (const expected of ["secrets", "errors", "backup", "telemetry", "flags", "data", "theme"] satisfies SettingsTabName[]) {
      await tabs.handleKey("\t");
      expect(tabs.current).toBe(expected);
    }

    await tabs.handleKey("\x1b[Z");
    expect(tabs.current).toBe("data");
    await tabs.handleKey("\x1b");
    expect(exited).toBe(true);
  });
});

describe("ThemeSettingsScreen", () => {
  test("renders ANSI color controls and applies accent changes through theme callback", async () => {
    const applied: unknown[] = [];
    const screen = new ThemeSettingsScreen({
      caller: {
        theme: {
          get: async () => ({ preset: "dark", accent: "#5fafff", accentAnsi: 75, borderAnsi: 75 }),
          set: async (input) => {
            applied.push(input);
            return { preset: "dark", accent: input.accent, accentAnsi: 202, borderAnsi: 202 };
          },
        },
      },
      onThemeApplied: (theme) => applied.push({ appliedBorderAnsi: theme.borderAnsi }),
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Settings > Theme");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("ANSI 75");

    await screen.setAccent("#ff5f00");
    expect(applied).toEqual([{ accent: "#ff5f00" }, { appliedBorderAnsi: 202 }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("ANSI 202");
  });
});

describe("SecretsSettingsScreen", () => {
  test("masks credentials, adds, reveals briefly, rotates, and deletes", async () => {
    const calls: unknown[] = [];
    const credentials = [{ id: "cred-1", name: "OPENAI_API_KEY", maskedValue: "********" }];
    const screen = new SecretsSettingsScreen({
      caller: {
        secrets: {
          list: async () => credentials,
          add: async (input) => {
            calls.push(["add", input]);
            credentials.push({ id: "cred-2", name: input.name, maskedValue: "********" });
            return { id: "cred-2" };
          },
          reveal: async (input) => {
            calls.push(["reveal", input]);
            return { value: "sk-test" };
          },
          rotate: async (input) => {
            calls.push(["rotate", input]);
            return { ok: true };
          },
          delete: async (input) => {
            calls.push(["delete", input]);
            credentials.splice(0, 1);
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("********");
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("sk-test");

    await screen.submitNewSecret("GITHUB_TOKEN", "ghp-test");
    await screen.handleKey("\r");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("sk-test");
    screen.expireRevealedValues();
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("sk-test");

    await screen.handleKey("R");
    await screen.handleKey("D");
    expect(calls).toEqual([
      ["add", { name: "GITHUB_TOKEN", value: "ghp-test" }],
      ["reveal", { id: "cred-1" }],
      ["rotate", { id: "cred-1" }],
      ["delete", { id: "cred-1" }],
    ]);
  });
});

describe("ErrorsSettingsScreen", () => {
  test("scrolls crash list, expands stack traces, deletes one, and clears all", async () => {
    const calls: unknown[] = [];
    const crashes = [
      { id: "err-1", message: "Render failed", stack: "Error: Render failed\n at render", at: "2026-05-03T10:00:00Z" },
      { id: "err-2", message: "Input failed", stack: "Error: Input failed\n at key", at: "2026-05-03T11:00:00Z" },
    ];
    const screen = new ErrorsSettingsScreen({
      caller: {
        errors: {
          list: async () => crashes,
          delete: async (input) => {
            calls.push(["delete", input]);
            crashes.splice(1, 1);
            return { ok: true };
          },
          clear: async () => {
            calls.push(["clear"]);
            crashes.length = 0;
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("j");
    await screen.handleKey("\r");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("at key");

    await screen.handleKey("D");
    await screen.handleKey("C");
    await screen.confirmClear();
    expect(calls).toEqual([["delete", { id: "err-2" }], ["clear"]]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("No crash reports");
  });
});

describe("BackupSettingsScreen", () => {
  test("creates backup with streamed KB progress and shows restore preflight counts", async () => {
    const restored: unknown[] = [];
    const screen = new BackupSettingsScreen({
      caller: {
        backup: {
          history: async () => [{ id: "b-1", path: "/tmp/fulcrum.bak", bytes: 2048, at: "2026-05-03T10:00:00Z" }],
          create: async function* () {
            yield { bytesWritten: 1024 };
            yield { bytesWritten: 2048, path: "/tmp/fulcrum-new.bak" };
          },
          preflightRestore: async (input) => ({ path: input.path, counts: { tasks: 2, docs: 1 } }),
          restore: async (input) => {
            restored.push(input);
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("B");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("2 KB written");

    await screen.submitRestorePath("/tmp/fulcrum.bak");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("tasks: 2");
    await screen.confirmRestore();
    expect(restored).toEqual([{ path: "/tmp/fulcrum.bak" }]);
  });
});

describe("TelemetrySettingsScreen", () => {
  test("toggles opt-in persistence and purges with before and after counts", async () => {
    let optIn = false;
    const purges: unknown[] = [];
    const screen = new TelemetrySettingsScreen({
      caller: {
        telemetry: {
          get: async () => ({ optIn, eventCount: 7 }),
          setOptIn: async (input) => {
            optIn = input.optIn;
            return { optIn };
          },
          purge: async () => {
            purges.push("purge");
            return { before: 7, after: 0 };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey(" ");
    await screen.handleKey("P");

    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Opt-in: yes");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Purged 7 -> 0");
    expect(purges).toEqual(["purge"]);
  });
});

describe("FeatureFlagsSettingsScreen", () => {
  test("toggles flags, edits rollout percent, and submits JSON cohort rules", async () => {
    const calls: unknown[] = [];
    const flags = [{ name: "agent-os", enabled: false, rolloutPercent: 10, cohortRules: { org: "local" } }];
    const screen = new FeatureFlagsSettingsScreen({
      caller: {
        featureFlags: {
          list: async () => flags,
          setEnabled: async (input) => {
            calls.push(["enabled", input]);
            flags[0]!.enabled = input.enabled;
            return { ok: true };
          },
          setRollout: async (input) => {
            calls.push(["rollout", input]);
            flags[0]!.rolloutPercent = input.rolloutPercent;
            return { ok: true };
          },
          setCohortRules: async (input) => {
            calls.push(["cohort", input]);
            flags[0]!.cohortRules = input.cohortRules as { org: string };
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey(" ");
    await screen.submitRolloutPercent(25);
    await screen.submitCohortRules('{"plan":"beta"}');

    expect(calls).toEqual([
      ["enabled", { flag: "agent-os", enabled: true }],
      ["rollout", { flag: "agent-os", rolloutPercent: 25 }],
      ["cohort", { flag: "agent-os", cohortRules: { plan: "beta" } }],
    ]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("25%");
  });
});

describe("DataSettingsScreen", () => {
  test("exports JSON with progress and imports after preflight confirmation", async () => {
    const calls: unknown[] = [];
    const screen = new DataSettingsScreen({
      caller: {
        data: {
          export: async function* (input) {
            calls.push(["export", input]);
            yield { bytesWritten: 1024 };
            yield { bytesWritten: 4096 };
          },
          preflightImport: async (input) => ({ path: input.path, counts: { tasks: 3, docs: 2 } }),
          import: async (input) => {
            calls.push(["import", input]);
            return { imported: 5 };
          },
        },
      },
    });

    await screen.submitExportPath("/tmp/fulcrum.json");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("4 KB exported");

    await screen.submitImportPath("/tmp/fulcrum.json");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("docs: 2");
    await screen.confirmImport();
    expect(calls).toEqual([
      ["export", { path: "/tmp/fulcrum.json" }],
      ["import", { path: "/tmp/fulcrum.json" }],
    ]);
  });
});
