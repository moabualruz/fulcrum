import { expect, test } from "@playwright/test";

test.describe("run cancel", () => {
	test("cancel button opens reason modal and requires a reason", async ({ page }) => {
		await page.goto("/run-cancel");
		await page.locator("[data-run-cancel-open]").click();
		await expect(page.locator("[data-run-cancel-modal]")).toBeVisible();
		await page.locator("[data-run-cancel-confirm]").click();
		await expect(page.locator("[data-run-cancel-error]")).toContainText("required");
	});

	test("confirming cancel flips status records reason and marks artifacts cancelled", async ({ page }) => {
		await page.goto("/run-cancel");
		await page.locator("[data-run-cancel-open]").click();
		await page.locator("[data-run-cancel-reason]").fill("user changed mind");
		await page.locator("[data-run-cancel-confirm]").click();
		await expect(page.locator("[data-run-cancel-page]")).toHaveAttribute("data-run-status", "cancelled");
		await expect(page.locator("[data-run-cancelled-reason]")).toHaveText("user changed mind");
		await expect(page.locator("[data-run-artifact='a1']")).toContainText("cancelled");
	});

	test("transcript remains visible after cancellation", async ({ page }) => {
		await page.goto("/run-cancel");
		await page.locator("[data-run-cancel-open]").click();
		await page.locator("[data-run-cancel-reason]").fill("done");
		await page.locator("[data-run-cancel-confirm]").click();
		await expect(page.locator("[data-run-transcript]")).toBeVisible();
	});
});
