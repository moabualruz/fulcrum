import { expect, test } from "@playwright/test";

test.describe("2FA verify on sign-in", () => {
	test("password then 2FA code", async ({ page }) => {
		await page.goto("/auth-2fa-verify");
		await expect(page.locator("[data-auth-2fa-page]")).toHaveAttribute("data-auth-step", "password");
		await page.locator("[data-auth-password-input]").fill("secret");
		await page.locator("[data-auth-password-submit]").click();
		await expect(page.locator("[data-auth-2fa-page]")).toHaveAttribute("data-auth-step", "2fa");
		await page.locator("[data-auth-code-input]").fill("123456");
		await page.locator("[data-auth-2fa-submit]").click();
		await expect(page.locator("[data-auth-done]")).toBeVisible();
	});

	test("wrong password stops at password step", async ({ page }) => {
		await page.goto("/auth-2fa-verify");
		await page.locator("[data-auth-password-input]").fill("wrong");
		await page.locator("[data-auth-password-submit]").click();
		await expect(page.locator("[data-auth-error]")).toContainText("Wrong");
		await expect(page.locator("[data-auth-2fa-page]")).toHaveAttribute("data-auth-step", "password");
	});

	test("recovery code path replaces TOTP", async ({ page }) => {
		await page.goto("/auth-2fa-verify");
		await page.locator("[data-auth-password-input]").fill("secret");
		await page.locator("[data-auth-password-submit]").click();
		await page.locator("[data-auth-2fa-toggle-recovery]").click();
		await page.locator("[data-auth-recovery-input]").fill("ABCD-1234");
		await page.locator("[data-auth-2fa-submit]").click();
		await expect(page.locator("[data-auth-done]")).toBeVisible();
	});

	test("invalid 2FA code stays on 2fa step", async ({ page }) => {
		await page.goto("/auth-2fa-verify");
		await page.locator("[data-auth-password-input]").fill("secret");
		await page.locator("[data-auth-password-submit]").click();
		await page.locator("[data-auth-code-input]").fill("000000");
		await page.locator("[data-auth-2fa-submit]").click();
		await expect(page.locator("[data-auth-error]")).toContainText("Invalid");
	});
});
