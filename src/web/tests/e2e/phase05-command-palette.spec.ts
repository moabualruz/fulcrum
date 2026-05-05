const isPlaywrightCli = process.argv.some((argument) => argument.includes("playwright"));

if (isPlaywrightCli) {
  const { expect, test } = await import("@playwright/test");

  test.describe("Phase 05 — Command Palette", () => {
    const modKey = process.platform === "darwin" ? "Meta+K" : "Control+K";

    test("Cmd+K opens palette and Escape closes it", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press(modKey);
      await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
      await expect(page.locator("[data-command-palette-input]")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-command-palette][data-state='open']")).toHaveCount(0);
    });

    test("typing task title shows matching results", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press(modKey);
      const input = page.locator("[data-command-palette-input]");
      await input.fill("Task");
      await expect(page.locator("[data-command-palette-result]").first()).toBeVisible();
    });

    test("arrow down and Enter navigates to selected result", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press(modKey);
      const input = page.locator("[data-command-palette-input]");
      await input.fill("Task");
      await page.locator("[data-command-palette-result]").first().waitFor();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("[data-command-palette-result][data-selected='true']")).toHaveCount(1);
      await page.keyboard.press("Enter");
      // Palette should close after navigation
      await expect(page.locator("[data-command-palette][data-state='open']")).toHaveCount(0);
    });

    test("? shortcut shows help overlay", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press("?");
      await expect(page.locator("[data-testid='keyboard-help-overlay']")).toBeVisible();
    });
  });
}

export {};
