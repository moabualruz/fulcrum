import { expect, test } from "@playwright/test";

test.describe("2FA setup", () => {
	test("happy path: intro → qr → verify → recovery → done", async ({ page }) => {
		await page.goto("/account-2fa-setup");
		await expect(page.locator("[data-2fa-setup-page]")).toHaveAttribute("data-2fa-step", "intro");
		await page.locator("[data-2fa-start]").click();
		await expect(page.locator("[data-2fa-setup-page]")).toHaveAttribute("data-2fa-step", "qr");
		await expect(page.locator("[data-2fa-secret]")).toBeVisible();
		await page.locator("[data-2fa-next]").click();
		await expect(page.locator("[data-2fa-setup-page]")).toHaveAttribute("data-2fa-step", "verify");
		await page.locator("[data-2fa-code]").fill("123456");
		await page.locator("[data-2fa-verify-submit]").click();
		await expect(page.locator("[data-2fa-setup-page]")).toHaveAttribute("data-2fa-step", "recovery");
		await expect(page.locator("[data-2fa-recovery-codes] li")).toHaveCount(8);
		await page.locator("[data-2fa-download]").click();
		await expect(page.locator("[data-2fa-downloaded]")).toBeVisible();
		await page.locator("[data-2fa-finish]").click();
		await expect(page.locator("[data-2fa-setup-page]")).toHaveAttribute("data-2fa-step", "done");
	});

	test("invalid code surfaces error and stays on verify", async ({ page }) => {
		await page.goto("/account-2fa-setup");
		await page.locator("[data-2fa-start]").click();
		await page.locator("[data-2fa-next]").click();
		await page.locator("[data-2fa-code]").fill("00000");
		await page.locator("[data-2fa-verify-submit]").click();
		await expect(page.locator("[data-2fa-error]")).toContainText("6 digits");
		await expect(page.locator("[data-2fa-setup-page]")).toHaveAttribute("data-2fa-step", "verify");
	});

	test("recovery download required before finish", async ({ page }) => {
		await page.goto("/account-2fa-setup");
		await page.locator("[data-2fa-start]").click();
		await page.locator("[data-2fa-next]").click();
		await page.locator("[data-2fa-code]").fill("123456");
		await page.locator("[data-2fa-verify-submit]").click();
		await page.locator("[data-2fa-finish]").click();
		await expect(page.locator("[data-2fa-error]")).toContainText("Download");
	});
});
