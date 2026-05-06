import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const SCREEN_SPECS = [
  { key: "auth", file: "src/tui/screens/auth.ts" },
  { key: "sprints", file: "src/tui/screens/sprints.ts" },
  { key: "connectors", file: "src/tui/screens/connectors.ts" },
  { key: "audit", file: "src/tui/screens/audit.ts" },
  { key: "task-calendar", file: "src/tui/screens/task-calendar.ts" },
  { key: "i18n-screen", file: "src/tui/screens/i18n-screen.ts" },
  { key: "theme", file: "src/tui/screens/theme.ts" },
  { key: "skills", file: "src/tui/screens/skills.ts" },
  { key: "settings-screens", file: "src/tui/screens/settings-screens.ts" },
] as const;

const E2E_SPECS = [
  "src/tui/e2e/tui-navigation.test.ts",
  "src/tui/e2e/tui-data-display.test.ts",
] as const;

describe("TUI screen application caller smoke", () => {
  test("enumerates all required screens", () => {
    expect(SCREEN_SPECS.map((screen) => screen.key)).toEqual([
      "auth",
      "sprints",
      "connectors",
      "audit",
      "task-calendar",
      "i18n-screen",
      "theme",
      "skills",
      "settings-screens",
    ]);
  });

  test.each(SCREEN_SPECS)("$key screen does not read product storage directly", ({ file }) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from .*product-kernel|EntityManager|em\.find|em\.persist|em\.flush/);
  });

  test.each(E2E_SPECS)("$# E2E spec does not import product-kernel or PGlite", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/product-kernel|openPglite|openProductDb|PGlite/);
  });
});
