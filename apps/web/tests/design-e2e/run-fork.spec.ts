import { expect, test } from "@playwright/test";

test.describe("run fork", () => {
	test("pause exposes fork option which creates a forked run attempt linked to source", async ({ page }) => {
		await page.goto("/run-fork");
		await page.locator("[data-run-pause]").click();
		await expect(page.locator("[data-run-pause-menu]")).toBeVisible();
		await page.locator("[data-run-fork]").click();
		await expect(page.locator("[data-run-row='r2']")).toHaveAttribute("data-run-parent", "r1");
		await expect(page.locator("[data-run-row='r2']")).toHaveAttribute("data-run-status", "running");
	});

	test("both original and fork are visible in the run feed", async ({ page }) => {
		await page.goto("/run-fork");
		await page.locator("[data-run-pause]").click();
		await page.locator("[data-run-fork]").click();
		await expect(page.locator("[data-run-row='r1']")).toBeVisible();
		await expect(page.locator("[data-run-row='r2']")).toBeVisible();
	});
});
