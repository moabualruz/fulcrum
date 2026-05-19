import { expect, test } from "@playwright/test";

test.describe("space permissions", () => {
	test("inherit toggle exposes its state", async ({ page }) => {
		await page.goto("/space-permissions");
		await expect(page.locator("[data-space-inherit-state]")).toContainText("on");
		await page.locator("[data-space-inherit]").uncheck();
		await expect(page.locator("[data-space-inherit-state]")).toContainText("off");
	});

	test("add assignment appends a row with the chosen role", async ({ page }) => {
		await page.goto("/space-permissions");
		await page.locator("[data-space-new-principal]").fill("bob");
		await page.locator("[data-space-new-role]").selectOption("admin");
		await page.locator("[data-space-add]").click();
		await expect(page.locator("[data-space-row='a3']")).toHaveAttribute("data-space-role", "admin");
		await expect(page.locator("[data-space-last-action]")).toContainText("added");
	});

	test("changing a row role and removing a row updates the table", async ({ page }) => {
		await page.goto("/space-permissions");
		await page.locator("[data-space-row-role='a1']").selectOption("viewer");
		await expect(page.locator("[data-space-row='a1']")).toHaveAttribute("data-space-role", "viewer");
		await page.locator("[data-space-row-remove='a2']").click();
		await expect(page.locator("[data-space-row='a2']")).toHaveCount(0);
	});
});
