import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const TUI_SRC_ROOT = new URL("../", import.meta.url);

const SCREEN_SPECS = [
  { key: "auth", file: "screens/auth.ts" },
  { key: "sprints", file: "screens/sprints.ts" },
  { key: "connectors", file: "screens/connectors.ts" },
  { key: "audit", file: "screens/audit.ts" },
  { key: "task-calendar", file: "screens/task-calendar.ts" },
  { key: "i18n-screen", file: "screens/i18n-screen.ts" },
  { key: "theme", file: "screens/theme.ts" },
  { key: "skills", file: "screens/skills.ts" },
  { key: "settings-screens", file: "screens/settings-screens.ts" },
] as const;

const E2E_SPECS = [
  "e2e/tui-navigation.test.ts",
  "e2e/tui-data-display.test.ts",
] as const;

const TUI_RUNTIME_BOUNDARY_SURFACES = [
  { key: "tui telemetry", file: "telemetry.ts" },
] as const;

const PRODUCT_KERNEL_PATTERN = `product-${"kernel"}`;
const TEST_STORE_PATTERN = `${"Test"}${"Store"}`;
const TUI_PRODUCT_ACCESS_PATTERN = new RegExp(`from .*${PRODUCT_KERNEL_PATTERN}|EntityManager|em\\.find|em\\.persist|em\\.flush`);
const TUI_E2E_PRODUCT_ACCESS_PATTERN = new RegExp(`${PRODUCT_KERNEL_PATTERN}|openIsolatedStore|PGlite`);
const TUI_RUNTIME_ACCESS_PATTERN = new RegExp(`from .*${PRODUCT_KERNEL_PATTERN}|openIsolatedStore|${TEST_STORE_PATTERN}`);

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

  test.each([...SCREEN_SPECS])("$key screen does not read product storage directly", ({ file }) => {
    const source = readFileSync(new URL(file, TUI_SRC_ROOT), "utf8");
    expect(source).not.toMatch(TUI_PRODUCT_ACCESS_PATTERN);
  });

  test.each([...E2E_SPECS])("$# E2E spec does not import product-kernel or PGlite", (file) => {
    const source = readFileSync(new URL(file, TUI_SRC_ROOT), "utf8");
    expect(source).not.toMatch(TUI_E2E_PRODUCT_ACCESS_PATTERN);
  });

  test("runtime boundary scan names tui telemetry surface without vendor paths", () => {
    expect(TUI_RUNTIME_BOUNDARY_SURFACES.map((surface) => surface.key)).toEqual(["tui telemetry"]);
    expect(TUI_RUNTIME_BOUNDARY_SURFACES.every((surface) => surface.file.startsWith(".."))).toBe(false);
    expect(TUI_RUNTIME_BOUNDARY_SURFACES.some((surface) => surface.file.includes("vendor/"))).toBe(false);
  });

  test.each([...TUI_RUNTIME_BOUNDARY_SURFACES])(
    "$key does not persist directly through EntityManager",
    ({ file }) => {
      const source = readFileSync(new URL(file, TUI_SRC_ROOT), "utf8");
      expect(source).not.toMatch(TUI_RUNTIME_ACCESS_PATTERN);
      expect(source).not.toMatch(/em\.(persist|flush)/);
    },
  );
});
