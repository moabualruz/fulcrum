import { expect, test } from "@playwright/test";

test.describe("account permanent delete", () => {
	test("renders policy header and export-first guidance", async ({ page }) => {
		await page.goto("/ship-archive");

		await expect(page.locator("[data-account-delete-header]")).toContainText("Permanently delete account");
		await expect(page.locator("[data-data-export]")).toBeVisible();
		await expect(page.locator("[data-request-export]")).toBeVisible();
	});

	test("request export confirmation toggles the button label", async ({ page }) => {
		await page.goto("/ship-archive");

		await page.locator("[data-request-export]").click();
		await expect(page.locator("[data-export-confirmation]")).toContainText("email a download link");
		await expect(page.locator("[data-request-export]")).toBeDisabled();
	});

	test("password verification rejects wrong input then advances to final confirm", async ({ page }) => {
		await page.goto("/ship-archive");

		await page.locator("[data-account-delete-start]").click();
		await page.locator("[data-account-password]").fill("wrong");
		await page.locator("[data-account-delete-verify]").click();
		await expect(page.locator("[data-account-delete-error]")).toContainText("incorrect");

		await page.locator("[data-account-password]").fill("right-pass");
		await page.locator("[data-account-delete-reason]").fill("Moving to a different workspace");
		await page.locator("[data-account-delete-verify]").click();
		await expect(page.locator("[data-account-delete-confirm]")).toBeVisible();
	});

	test("final confirm writes audit record with timestamp and reason", async ({ page }) => {
		await page.goto("/ship-archive");

		await page.locator("[data-account-delete-start]").click();
		await page.locator("[data-account-password]").fill("right-pass");
		await page.locator("[data-account-delete-reason]").fill("Project shutdown");
		await page.locator("[data-account-delete-verify]").click();
		await page.locator("[data-account-delete-confirm]").click();
		await expect(page.locator("[data-account-delete-audit]")).toContainText("Project shutdown");
		await expect(page.locator("[data-account-delete-audit]")).toContainText("deleted_at=");
	});
});
