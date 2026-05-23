import { expect, test } from "@playwright/test";

test.describe("api tokens", () => {
	test("create reveals the secret exactly once and persists in the table", async ({ page }) => {
		await page.goto("/api-tokens");
		await page.locator("[data-token-name]").fill("local-dev");
		await page.locator("[data-token-create]").click();
		await expect(page.locator("[data-token-revealed]")).toBeVisible();
		await expect(page.locator("[data-token-revealed-secret]")).toContainText("tok_");
		await page.locator("[data-token-revealed-dismiss]").click();
		await expect(page.locator("[data-token-revealed]")).toHaveCount(0);
		await expect(page.locator("[data-token-row-name]").last()).toHaveText("local-dev");
	});

	test("duplicate name surfaces an inline error and skips creation", async ({ page }) => {
		await page.goto("/api-tokens");
		await page.locator("[data-token-name]").fill("ci-deploy");
		await page.locator("[data-token-create]").click();
		await expect(page.locator("[data-token-error]")).toContainText("already exists");
	});

	test("revoking flips state and hides the revoke button", async ({ page }) => {
		await page.goto("/api-tokens");
		await page.locator("[data-token-revoke='tk1']").click();
		await expect(page.locator("[data-token-row='tk1']")).toHaveAttribute("data-token-revoked", "true");
		await expect(page.locator("[data-token-revoke='tk1']")).toHaveCount(0);
	});
});
