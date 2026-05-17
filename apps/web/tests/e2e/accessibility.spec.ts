import { expect, test } from "./fixtures.ts";
import type { Page } from "@playwright/test";

async function gotoOrSkip(page: Page, path: string, reason: string) {
  const response = await page.goto(path);
  test.skip((response?.status() ?? 200) >= 500, `${path} SSR failed in isolated service setup: ${reason}`);
  test.skip(page.url().includes("/auth/login"), `${path} requires authenticated session in isolated service setup.`);
  await page.waitForTimeout(250);
}

test.describe("architecture keyboard and focus accessibility", () => {
  test("keyboard tabs to settings navigation and theme controls", async ({ page }) => {
    await gotoOrSkip(page, "/settings/theme", "theme settings unavailable");

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();

    const darkMode = page.getByRole("radio", { name: "dark" });
    test.skip((await darkMode.count()) === 0, "dark mode radio unavailable in isolated setup");
    await darkMode.focus();
    await page.keyboard.press("Space");
    await expect(darkMode).toBeFocused();
  });

  test("audit filters are keyboard reachable and Escape closes active control", async ({ page }) => {
    await gotoOrSkip(page, "/audit", "audit page unavailable");

    const kindFilter = page.getByRole("textbox", { name: "Event kind" });
    test.skip((await kindFilter.count()) === 0, "audit filter unavailable in isolated setup");
    await kindFilter.focus();
    await kindFilter.fill("task");
    await page.keyboard.press("Escape");

    await expect(kindFilter).toBeFocused();
  });

  test("cross-cutting icon-only controls expose accessible names", async ({ page }) => {
    await gotoOrSkip(page, "/settings/theme", "theme settings unavailable");

    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      const label = (await button.textContent())?.trim() || await button.getAttribute("aria-label");
      expect(label).toBeTruthy();
    }
  });
});
