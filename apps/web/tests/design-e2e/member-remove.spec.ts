import { expect, test } from "@playwright/test";

test.describe("member remove", () => {
	test("transfer retention requires a recipient", async ({ page }) => {
		await page.goto("/member-remove");
		await page.locator("[data-member-remove-start='m3']").click();
		await page.locator("[data-member-confirm-yes]").click();
		await expect(page.locator("[data-member-error]")).toContainText("recipient");
	});

	test("transfer retention with recipient removes the member and records the transfer", async ({ page }) => {
		await page.goto("/member-remove");
		await page.locator("[data-member-remove-start='m3']").click();
		await page.locator("[data-retention-transfer-to]").selectOption("m2");
		await page.locator("[data-member-confirm-yes]").click();
		await expect(page.locator("[data-member-row='m3']")).toHaveCount(0);
		await expect(page.locator("[data-member-removed-retention]")).toHaveText("transfer");
		await expect(page.locator("[data-member-removed-transfer]")).toHaveText("m2");
	});

	test("delete retention removes without requiring transfer recipient", async ({ page }) => {
		await page.goto("/member-remove");
		await page.locator("[data-member-remove-start='m3']").click();
		await page.locator("[data-retention-option='delete']").check();
		await page.locator("[data-member-confirm-yes]").click();
		await expect(page.locator("[data-member-removed-retention]")).toHaveText("delete");
	});

	test("owner row hides the remove button", async ({ page }) => {
		await page.goto("/member-remove");
		await expect(page.locator("[data-member-remove-start='m1']")).toHaveCount(0);
	});
});
