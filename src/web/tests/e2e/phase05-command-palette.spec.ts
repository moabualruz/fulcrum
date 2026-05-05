import { test, expect } from "./fixtures.ts";

test.describe("Phase 05 — Command Palette", () => {
  const modKey = process.platform === "darwin" ? "Meta+K" : "Control+K";

  test("Cmd+K opens palette and Escape closes it", async ({ page, fulcrumHome }) => {
    const { seedProject } = fulcrumHome;
    const proj = await seedProject("palette-test", "Palette Test");

    await page.goto(`/projects/${proj.id}/board`);
    await page.keyboard.press(modKey);
    await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
    await expect(page.locator("[data-command-palette-input]")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-command-palette][data-state='open']")).toHaveCount(0);
  });

  test("typing task title shows matching results", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("palette-search-test", "Palette Search Test");
    await seedTask({ projectId: proj.id, title: "Searchable Task", status: "pending" });

    await page.goto(`/projects/${proj.id}/board`);
    await page.keyboard.press(modKey);
    const input = page.locator("[data-command-palette-input]");
    await input.fill("Task");
    await expect(page.locator("[data-command-palette-item]").first()).toBeVisible();
  });

  test("arrow down and Enter navigates to selected result", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("palette-nav-test", "Palette Nav Test");
    await seedTask({ projectId: proj.id, title: "Navigable Task", status: "pending" });

    await page.goto(`/projects/${proj.id}/board`);
    await page.keyboard.press(modKey);
    const input = page.locator("[data-command-palette-input]");
    await input.fill("Task");
    await page.locator("[data-command-palette-item]").first().waitFor();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-command-palette-item][data-selected='true']")).toHaveCount(1);
    await page.keyboard.press("Enter");
    // Palette should close after navigation
    await expect(page.locator("[data-command-palette][data-state='open']")).toHaveCount(0);
  });

  test("? shortcut shows help overlay", async ({ page, fulcrumHome }) => {
    const { seedProject } = fulcrumHome;
    const proj = await seedProject("help-overlay-test", "Help Overlay Test");

    await page.goto(`/projects/${proj.id}/board`);
    await page.keyboard.press("?");
    await expect(page.locator("[data-testid='keyboard-help-overlay']")).toBeVisible();
  });
});
