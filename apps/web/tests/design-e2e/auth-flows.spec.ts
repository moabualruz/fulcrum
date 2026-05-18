import { expect, test } from "@playwright/test";

test.describe("auth login flow", () => {
	test("submits email/password while keeping OAuth and passkey controls available", async ({ page }) => {
		await page.goto("/auth-flows");

		await expect(page.locator("[data-auth-flows-header]")).toContainText("Log in");
		await expect(page.locator("#login-email")).toHaveAttribute("type", "email");
		await expect(page.locator("#login-email")).toHaveAttribute("required", "");
		await expect(page.locator("#login-password")).toHaveAttribute("type", "password");
		await expect(page.locator("#login-password")).toHaveAttribute("required", "");
		await expect(page.locator("[data-oauth-google]")).toBeVisible();
		await expect(page.locator("[data-oauth-github]")).toBeVisible();
		await expect(page.locator("[data-passkey-login]")).toBeVisible();

		await page.locator("#login-email").fill("maya@example.com");
		await page.locator("#login-password").fill("correct-horse-battery-staple");
		await page.locator("button[type='submit']").click();

		await expect(page.locator("[data-email-password-post]")).toContainText('"method": "POST"');
		await expect(page.locator("[data-email-password-post]")).toContainText('"email": "maya@example.com"');
		await expect(page.locator("[data-email-password-post]")).toContainText('"password": "[masked]"');
	});

	test("posts OAuth provider payload and keeps the password form accessible while OAuth is busy", async ({ page }) => {
		await page.goto("/auth-flows");

		await page.locator("[data-oauth-google]").click();
		await expect(page.locator("[data-oauth-google]")).toContainText("Redirecting...");
		await expect(page.locator("#login-email")).toBeEnabled();
		await expect(page.locator("#login-password")).toBeEnabled();
		await expect(page.locator("[data-oauth-post]")).toContainText("/api/auth/sign-in/social");
		await expect(page.locator("[data-oauth-post]")).toContainText('"provider": "google"');
		await expect(page.locator("[data-oauth-post]")).toContainText('"callbackURL": "/"');
	});

	test("shows passkey recovery guidance and unsupported-browser fallback", async ({ page }) => {
		await page.goto("/auth-flows");

		await page.locator("[data-passkey-login]").click();
		await expect(page.locator("[data-passkey-error]")).toContainText("Use email and password");

		await page.locator("[data-passkey-register]").click();
		await expect(page.locator("[data-passkey-message]")).toContainText("Passkey registered");

		await page.locator("[data-passkey-supported-toggle]").uncheck();
		await expect(page.locator("[data-passkey-login]")).toHaveCount(0);
		await expect(page.locator("[data-passkey-unsupported]")).toContainText("Continue with email and password");
	});

	test("keeps auth flow controls usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/auth-flows");

		await page.locator("#login-email").fill("mobile@example.com");
		await page.locator("#login-password").fill("masked-value");
		await expect(page.locator("[data-auth-flow-card]")).toBeVisible();

		const overflow = await page.locator("[data-auth-flows-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
