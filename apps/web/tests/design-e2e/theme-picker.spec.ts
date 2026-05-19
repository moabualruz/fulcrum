import { expect, test } from "@playwright/test";

test.describe("theme picker", () => {
	test("selecting a preset updates active marker and font", async ({ page }) => {
		await page.goto("/theme-picker");
		await expect(page.locator("[data-theme-preset='default']")).toHaveAttribute("data-theme-preset-active", "true");
		await page.locator("[data-theme-preset='monochrome']").click();
		await expect(page.locator("[data-theme-preset='monochrome']")).toHaveAttribute("data-theme-preset-active", "true");
		await expect(page.locator("[data-theme-font]")).toHaveValue("mono");
	});

	test("hue and radius sliders update with input", async ({ page }) => {
		await page.goto("/theme-picker");
		const hue = page.locator("[data-theme-hue]");
		await hue.fill("12");
		await expect(hue).toHaveValue("12");
		const radius = page.locator("[data-theme-radius]");
		await radius.fill("1.25");
		await expect(radius).toHaveValue("1.25");
	});

	test("save persists settings to profile", async ({ page }) => {
		await page.goto("/theme-picker");
		await page.locator("[data-theme-hue]").fill("180");
		await page.locator("[data-theme-preset='ocean']").click();
		await page.locator("[data-theme-save]").click();
		await expect(page.locator("[data-theme-saved-preset]")).toHaveText("ocean");
	});

	test("reset returns to default preset", async ({ page }) => {
		await page.goto("/theme-picker");
		await page.locator("[data-theme-preset='sunset']").click();
		await page.locator("[data-theme-reset]").click();
		await expect(page.locator("[data-theme-preset='default']")).toHaveAttribute("data-theme-preset-active", "true");
	});
});
